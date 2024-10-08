import readline from 'readline';
import { AgentContext } from '#agent/agentContext';
import { Slack } from '#functions/slack';
import { logger } from '#o11y/logger';
/**
 * Adding a human in the loop, so it doesn't consume all of your budget
 */
import { startSpan, withSpan } from '#o11y/trace';
import { sleep } from '#utils/async-utils';

export async function waitForConsoleInput(humanInLoopReason: string) {
	await withSpan('consoleHumanInLoop', async () => {
		const span = startSpan('consoleHumanInLoop');

		// await appContext().agentStateService.updateState(agentContextStorage.getStore(), 'humanInLoop_agent');

		// Beep beep!
		const delayMs = 100;
		const beeps = 3;

		for (let i = 0; i < beeps; i++) {
			process.stdout.write('\u0007');
			await sleep(delayMs);
		}

		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		const question = (prompt) =>
			new Promise((resolve) => {
				rl.question(prompt, resolve);
			});

		await (async () => {
			logger.flush();
			await question(`Human-in-the-loop check: ${humanInLoopReason} \nPress enter to continue...`);
			rl.close();
		})();
	});
}

export async function notifySupervisor(agent: AgentContext, message: string) {
	const slackConfig = agent.user.functionConfig[Slack.name];
	// TODO check for env vars
	if (slackConfig?.webhookUrl || slackConfig?.token) {
		try {
			await new Slack().sendMessage(message);
		} catch (e) {
			logger.error(e, 'Failed to send supervisor notification message');
		}
	}
}

export async function agentHumanInTheLoop(reason: string) {
	await waitForConsoleInput(reason);
}

export async function toolHumanInTheLoop(reason: string) {
	await waitForConsoleInput(reason);
}
