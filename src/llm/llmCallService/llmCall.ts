import { CallerId } from '#llm/llmCallService/llmCallService';

export interface LlmRequest {
	/** UUID */
	id: string;
	/** From the GenerateTextOptions.id field */
	description?: string;
	systemPrompt?: string;
	userPrompt: string;
	/** Populated when called by an agent */
	agentId?: string;
	/** Populated when called by a user through the UI */
	userId?: string;
	callStack?: string;
	/** LLM service/model identifier */
	llmId: string;
	/** Time of the LLM request */
	requestTime: number;
}

// New fields need to be added in FirestoreLlmCallService.getLlmResponsesByAgentId
export interface LlmCall extends LlmRequest {
	responseText?: string;
	/** Duration in millis until the first response from the LLM */
	timeToFirstToken?: number;
	/** Duration in millis for the full response */
	totalTime?: number;
	/** Cost in $USD */
	cost?: number;
	inputTokens?: number;
	outputTokens?: number;
}

export type CreateLlmRequest = Omit<LlmRequest, 'id' | 'requestTime'>;
