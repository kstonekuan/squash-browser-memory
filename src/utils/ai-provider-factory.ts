/**
 * AI Provider Factory - Creates and manages AI providers
 */

import { match } from "ts-pattern";
import type {
	AIProvider,
	AIProviderConfig,
	AIProviderType,
} from "./ai-interface";
import { ChromeAIProvider } from "./chrome-ai";
import { GeminiProvider } from "./gemini-provider";
import { ClaudeProvider } from "./remote-ai";

// Provider instances for singleton pattern
let chromeProvider: ChromeAIProvider | null = null;
let claudeProvider: ClaudeProvider | null = null;
let geminiProvider: GeminiProvider | null = null;

/**
 * Get an AI provider instance based on configuration
 */
export function getProvider(config: AIProviderConfig): AIProvider {
	return match(config)
		.with({ provider: "chrome" }, () => {
			if (!chromeProvider) {
				chromeProvider = new ChromeAIProvider();
			}
			return chromeProvider;
		})
		.with({ provider: "claude" }, (conf) => {
			if (!claudeProvider || conf.claudeApiKey) {
				claudeProvider = new ClaudeProvider(conf.claudeApiKey);
			}

			if (!claudeProvider) {
				throw new Error("Could not create Claude provider instance");
			}

			return claudeProvider;
		})
		.with({ provider: "gemini" }, (conf) => {
			if (!geminiProvider || conf.geminiApiKey) {
				geminiProvider = new GeminiProvider(conf.geminiApiKey);
			}

			if (!geminiProvider) {
				throw new Error("Could not create Gemini provider instance");
			}

			return geminiProvider;
		})
		.exhaustive();
}

/**
 * Get all available provider types
 */
export function getAvailableProviders(): AIProviderType[] {
	return ["chrome", "claude", "gemini"];
}

/**
 * Get provider display names
 */
export function getProviderDisplayName(type: AIProviderType): string {
	return match(type)
		.with("chrome", () => "Chrome AI (Local)")
		.with("claude", () => "Claude API (Remote)")
		.with("gemini", () => "Gemini API (Remote)")
		.exhaustive();
}
