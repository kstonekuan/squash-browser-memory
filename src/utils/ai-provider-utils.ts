/// <reference types="@types/dom-chromium-ai" />

/**
 * AI Provider Utilities - Helper functions for working with AI providers
 */

import { loadAIConfigFromStorage } from "./ai-config";
import type { AIProvider } from "./ai-interface";
import { getProvider } from "./ai-provider-factory";

// Store the current provider instance
let currentProvider: AIProvider | null = null;
let isInitialized = false;

/**
 * Get or create an initialized AI provider using the current configuration
 */
export async function getInitializedProvider(
	systemPrompt?: string,
	onDownloadProgress?: (progress: number) => void,
): Promise<AIProvider | null> {
	try {
		const config = await loadAIConfigFromStorage();
		const provider = getProvider(config);

		// Check if we need to reinitialize (different provider or not initialized)
		if (currentProvider !== provider || !isInitialized) {
			currentProvider = provider;
			await provider.initialize(systemPrompt, onDownloadProgress);
			isInitialized = true;
			console.log(`Initialized AI provider: ${provider.getProviderName()}`);
		} else if (systemPrompt && currentProvider) {
			// Reinitialize with new system prompt if provided
			await currentProvider.initialize(systemPrompt, onDownloadProgress);
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
