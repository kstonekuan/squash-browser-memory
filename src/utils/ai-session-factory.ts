/// <reference types="@types/dom-chromium-ai" />

/**
 * AI Session Factory - Creates AI sessions based on current configuration
 */

import { loadAIConfigFromStorage } from "./ai-config";
import type { AISession } from "./ai-interface";
import { getProvider } from "./ai-provider-factory";

/**
 * Create an AI session using the currently configured provider
 */
export async function createAISession(
	systemPrompt?: string,
): Promise<AISession | null> {
	try {
		const config = await loadAIConfigFromStorage();
		const provider = getProvider(config);

		const session = await provider.createSession(systemPrompt);

		if (!session) {
			console.error(
				`Failed to create session with ${provider.getProviderName()}`,
			);
			return null;
		}

		console.log(`Created AI session using ${provider.getProviderName()}`);
		return session;
	} catch (error) {
		console.error("Failed to create AI session:", error);
		return null;
	}
}

/**
 * Prompt an AI session with error handling and provider-agnostic interface
 */
export async function promptAI(
	session: AISession,
	text: string,
	options?: LanguageModelPromptOptions,
): Promise<string> {
	try {
		return await session.prompt(text, options);
	} catch (error) {
		console.error("AI Prompt Error:", error);
		throw error;
	}
}
