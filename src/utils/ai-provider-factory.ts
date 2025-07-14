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
import { ClaudeProvider } from "./claude-provider";
import { GeminiProvider } from "./gemini-provider";

/**
 * Create a new AI provider instance based on configuration
 * Note: The offscreen document manages provider lifecycle
 */
export function createProvider(config: AIProviderConfig): AIProvider {
	return match(config)
		.with({ provider: "chrome" }, () => {
			return new ChromeAIProvider();
		})
		.with({ provider: "claude" }, (conf) => {
			return new ClaudeProvider(conf.claudeApiKey);
		})
		.with({ provider: "gemini" }, (conf) => {
			return new GeminiProvider(conf.geminiApiKey);
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
