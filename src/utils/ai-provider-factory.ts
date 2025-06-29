/**
 * AI Provider Factory - Creates and manages AI providers
 */

import type {
	AIProvider,
	AIProviderConfig,
	AIProviderType,
} from "./ai-interface";
import { ChromeAIProvider } from "./chrome-ai";
import { ClaudeProvider } from "./remote-ai";

// Provider instances for singleton pattern
let chromeProvider: ChromeAIProvider | null = null;
let claudeProvider: ClaudeProvider | null = null;

/**
 * Get an AI provider instance based on configuration
 */
export function getProvider(config: AIProviderConfig): AIProvider {
	switch (config.provider) {
		case "chrome":
			if (!chromeProvider) {
				chromeProvider = new ChromeAIProvider();
			}
			return chromeProvider;

		case "claude":
			if (!claudeProvider || config.claudeApiKey) {
				claudeProvider = new ClaudeProvider(config.claudeApiKey);
			}
			return claudeProvider;

		default:
			throw new Error(`Unknown AI provider: ${config.provider}`);
	}
}

/**
 * Get all available provider types
 */
export function getAvailableProviders(): AIProviderType[] {
	return ["chrome", "claude"];
}

/**
 * Get provider display names
 */
export function getProviderDisplayName(type: AIProviderType): string {
	switch (type) {
		case "chrome":
			return "Chrome AI (Local)";
		case "claude":
			return "Claude API (Remote)";
		default:
			return type;
	}
}

/**
 * Check if a provider requires configuration
 */
export function providerRequiresConfiguration(type: AIProviderType): boolean {
	switch (type) {
		case "chrome":
			return false;
		case "claude":
			return true;
		default:
			return false;
	}
}

/**
 * Reset provider instances (useful for testing or configuration changes)
 */
export function resetProviders(): void {
	chromeProvider = null;
	claudeProvider = null;
}
