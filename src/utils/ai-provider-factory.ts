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

/**
 * Factory class to create and manage AI providers
 */
export class AIProviderFactory {
	private static chromeProvider: ChromeAIProvider | null = null;
	private static claudeProvider: ClaudeProvider | null = null;

	/**
	 * Get an AI provider instance based on configuration
	 */
	static getProvider(config: AIProviderConfig): AIProvider {
		switch (config.provider) {
			case "chrome":
				if (!AIProviderFactory.chromeProvider) {
					AIProviderFactory.chromeProvider = new ChromeAIProvider();
				}
				return AIProviderFactory.chromeProvider;

			case "claude":
				if (!AIProviderFactory.claudeProvider || config.claudeApiKey) {
					AIProviderFactory.claudeProvider = new ClaudeProvider(
						config.claudeApiKey,
					);
				}
				return AIProviderFactory.claudeProvider;

			default:
				throw new Error(`Unknown AI provider: ${config.provider}`);
		}
	}

	/**
	 * Get all available provider types
	 */
	static getAvailableProviders(): AIProviderType[] {
		return ["chrome", "claude"];
	}

	/**
	 * Get provider display names
	 */
	static getProviderDisplayName(type: AIProviderType): string {
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
	static providerRequiresConfiguration(type: AIProviderType): boolean {
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
	static resetProviders(): void {
		AIProviderFactory.chromeProvider = null;
		AIProviderFactory.claudeProvider = null;
	}
}
