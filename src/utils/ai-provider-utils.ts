/// <reference types="@types/dom-chromium-ai" />

/**
 * AI Provider Utilities - Helper functions for working with AI providers
 */

import type { AIProvider, AIProviderConfig } from "./ai-interface";
import { getProvider } from "./ai-provider-factory";

// Store the current provider instance
let currentProvider: AIProvider | null = null;
let isInitialized = false;

/**
 * Get or create an initialized AI provider using the current configuration
 * @param systemPrompt Optional system prompt to use
 * @param config Optional AI provider config to use instead of loading from storage
 */
export async function getInitializedProvider(
	config: AIProviderConfig,
	systemPrompt?: string,
): Promise<AIProvider | null> {
	try {
		const provider = getProvider(config);

		// Check if we need to reinitialize (different provider or not initialized)
		if (currentProvider !== provider || !isInitialized) {
			currentProvider = provider;
			await provider.initialize(systemPrompt);
			isInitialized = true;
			console.log(`Initialized AI provider: ${provider.getProviderName()}`);
		} else if (systemPrompt && currentProvider) {
			// Reinitialize with new system prompt if provided
			await currentProvider.initialize(systemPrompt);
		}

		return currentProvider;
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
