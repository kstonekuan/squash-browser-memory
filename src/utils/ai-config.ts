/**
 * AI Provider Configuration Management
 */

import type { AIProviderConfig } from "./ai-interface";

const AI_CONFIG_KEY = "ai_provider_config";

const DEFAULT_CONFIG: AIProviderConfig = {
	provider: "chrome",
};

/**
 * Load AI provider configuration from storage
 */
export async function loadAIConfig(): Promise<AIProviderConfig> {
	try {
		const result = await chrome.storage.local.get(AI_CONFIG_KEY);
		const stored = result[AI_CONFIG_KEY];

		if (!stored) {
			console.log("No AI config found, using default");
			return DEFAULT_CONFIG;
		}

		// Validate the configuration
		if (!stored.provider || !["chrome", "claude"].includes(stored.provider)) {
			console.warn("Invalid AI provider in config, using default");
			return DEFAULT_CONFIG;
		}

		console.log("Loaded AI config:", { provider: stored.provider });
		return stored;
	} catch (error) {
		console.error("Failed to load AI config:", error);
		return DEFAULT_CONFIG;
	}
}

/**
 * Save AI provider configuration to storage
 */
export async function saveAIConfig(config: AIProviderConfig): Promise<void> {
	try {
		await chrome.storage.local.set({ [AI_CONFIG_KEY]: config });
		console.log("Saved AI config:", { provider: config.provider });
	} catch (error) {
		console.error("Failed to save AI config:", error);
	}
}

/**
 * Set Claude API key
 */
export async function setClaudeApiKey(apiKey: string): Promise<void> {
	const config = await loadAIConfig();
	config.claudeApiKey = apiKey;
	await saveAIConfig(config);
}

/**
 * Get Claude API key
 */
export async function getClaudeApiKey(): Promise<string | undefined> {
	const config = await loadAIConfig();
	return config.claudeApiKey;
}
