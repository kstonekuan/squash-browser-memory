/// <reference types="@types/dom-chromium-ai" />

/**
 * AI Provider Utilities - Helper functions for working with AI providers
 */

import type { AIProvider, AIProviderConfig } from "./ai-interface";
import { createProvider } from "./ai-provider-factory";

/**
 * Create and initialize a new AI provider instance using the given configuration
 * @param systemPrompt Optional system prompt to use
 * @param config AI provider config to use
 */
export async function getInitializedProvider(
	config: AIProviderConfig,
	systemPrompt?: string,
): Promise<AIProvider | null> {
	try {
		const provider = createProvider(config);

		// Initialize the new provider instance
		await provider.initialize(systemPrompt);
		console.log(`Initialized AI provider: ${provider.getProviderName()}`);

		return provider;
	} catch (error) {
		console.error("Failed to initialize AI provider:", error);
		return null;
	}
}

/**
 * Prompt the AI provider with error handling
 */
export async function promptAI(
	provider: AIProvider,
	text: string,
	options?: LanguageModelPromptOptions,
): Promise<string> {
	try {
		return await provider.prompt(text, options);
	} catch (error) {
		console.error("AI Prompt Error:", error);
		throw error;
	}
}
