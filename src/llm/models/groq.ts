import Groq from 'groq-sdk';
import { AgentLLMs, agentContext } from '#agent/agentContext';
import { addCost } from '#agent/agentContext';
import { LlmCall } from '#llm/llmCallService/llmCall';
import { CallerId } from '#llm/llmCallService/llmCallService';
import { withActiveSpan } from '#o11y/trace';
import { currentUser } from '#user/userService/userContext';
import { envVar } from '#utils/env-var';
import { appContext } from '../../app';
import { RetryableError } from '../../cache/cacheRetry';
import { BaseLLM } from '../base-llm';
import { GenerateTextOptions, LLM, combinePrompts, logDuration } from '../llm';
import { MultiLLM } from '../multi-llm';

export const GROQ_SERVICE = 'groq';

export function groqLLMRegistry(): Record<string, () => LLM> {
	return {
		'groq:mixtral-8x7b-32768': groqMixtral8x7b,
		'groq:gemma-7b-it': groqGemma7bIt,
		'groq:llama3-70b-8192': groqLlama3_70B,
		'groq:gemma2-9b-it': groqGemma2_9b,
		'groq:llama3-8b-8192': groqLlama3_8b,
	};
}

export function groqGemma2_9b(): LLM {
	return new GroqLLM(
		'Gemma2 9b-it (Groq)',
		GROQ_SERVICE,
		'gemma2-9b-it',
		8_192,
		(input: string) => (input.length * 0.2) / (1_000_000 * 3.5),
		(output: string) => (output.length * 0.2) / (1_000_000 * 3.5),
	);
}

export function groqLlama3_8b(): LLM {
	return new GroqLLM(
		'LLaMA3 8b (Groq)',
		GROQ_SERVICE,
		'llama3-8b-8192',
		8_192,
		(input: string) => (input.length * 0.05) / (1_000_000 * 4),
		(output: string) => (output.length * 0.08) / (1_000_000 * 4),
	);
}

export function groqMixtral8x7b(): LLM {
	return new GroqLLM(
		'Mixtral 8x7b (Groq)',
		GROQ_SERVICE,
		'mixtral-8x7b-32768',
		32_768,
		(input: string) => (input.length * 0.27) / (1_000_000 * 3.5),
		(output: string) => (output.length * 0.27) / (1_000_000 * 3.5),
	);
}

export function groqGemma7bIt(): LLM {
	return new GroqLLM(
		'Gemma 7b-it (Groq)',
		GROQ_SERVICE,
		'gemma-7b-it',
		8_192,
		(input: string) => (input.length * 0.1) / (1_000_000 * 3.5),
		(output: string) => (output.length * 0.1) / (1_000_000 * 3.5),
	);
}

export function groqLlama3_70B(): LLM {
	return new GroqLLM(
		'Llama3 70b (Groq)',
		GROQ_SERVICE,
		'llama-3.1-70b-versatile',
		8000, //131_072,
		(input: string) => (input.length * 0.59) / (1_000_000 * 4),
		(output: string) => (output.length * 0.79) / (1_000_000 * 4),
	);
}

export function grokLLMs(): AgentLLMs {
	const mixtral = groqMixtral8x7b();
	return {
		easy: groqGemma7bIt(),
		medium: mixtral,
		hard: groqLlama3_70B(),
		xhard: new MultiLLM([mixtral, groqLlama3_70B()], 5),
	};
}

/**
 * https://wow.groq.com/
 */
export class GroqLLM extends BaseLLM {
	_groq: Groq;

	groq(): Groq {
		if (!this._groq) {
			this._groq = new Groq({
				apiKey: currentUser().llmConfig.groqKey ?? envVar('GROQ_API_KEY'),
			});
		}
		return this._groq;
	}

	@logDuration
	async generateText(userPrompt: string, systemPrompt?: string, opts?: GenerateTextOptions): Promise<string> {
		return withActiveSpan(`generateText ${opts?.id ?? ''}`, async (span) => {
			const prompt = combinePrompts(userPrompt, systemPrompt);
			if (systemPrompt) span.setAttribute('systemPrompt', systemPrompt);
			span.setAttributes({
				userPrompt,
				inputChars: prompt.length,
				model: this.model,
				service: this.service,
			});
			span.setAttribute('userPrompt', userPrompt);
			span.setAttribute('inputChars', prompt.length);

			const llmCallSave: Promise<LlmCall> = appContext().llmCallService.saveRequest({
				userPrompt,
				systemPrompt,
				llmId: this.getId(),
				agentId: agentContext()?.agentId,
				callStack: agentContext()?.callStack.join(' > '),
			});
			const requestTime = Date.now();

			try {
				const completion = await this.groq().chat.completions.create({
					messages: [
						{
							role: 'user',
							content: prompt,
						},
					],
					model: this.model,
				});
				const responseText = completion.choices[0]?.message?.content || '';

				const timeToFirstToken = Date.now() - requestTime;
				const finishTime = Date.now();
				const llmCall: LlmCall = await llmCallSave;

				const inputCost = this.calculateInputCost(prompt);
				const outputCost = this.calculateOutputCost(responseText);
				const cost = inputCost + outputCost;
				addCost(cost);

				llmCall.responseText = responseText;
				llmCall.timeToFirstToken = timeToFirstToken;
				llmCall.totalTime = finishTime - requestTime;
				llmCall.cost = cost;

				try {
					await appContext().llmCallService.saveResponse(llmCall);
				} catch (e) {
					// queue to save
					console.error(e);
				}

				span.setAttributes({
					response: responseText,
					inputCost,
					outputCost,
					cost,
					outputChars: responseText.length,
				});

				return responseText;
			} catch (e) {
				if (e.error?.code === 'rate_limit_exceeded') throw new RetryableError(e);
				throw e;
			}
		});
	}
}

// error: {
// 	error: {
// 		message: 'Rate limit reached for model `mixtral-8x7b-32768` in organization `org_` on tokens per minute (TPM): Limit 18000, Used 0, Requested ~36313. Please try again in 1m1.043333333s. Visit https://console.groq.com/docs/rate-limits for more information.',
// 			type: 'tokens',
// 			code: 'rate_limit_exceeded'
// 	}
// }
