/**
 * AI Provider Configuration Management
 */

import type { AIProviderConfig } from "./ai-interface";

const AI_CONFIG_KEY = "ai_provider_config";

const DEFAULT_CONFIG: AIProviderConfig = {
	provider: "chrome",
};

/**
 * Load AI config for offscreen context by communicating with the service worker
 */
export async function loadAIConfigFromServiceWorker(): Promise<AIProviderConfig> {
	try {
		// Import tRPC client only when needed to avoid circular dependencies
		const { uiToBackgroundClient } = await import("../trpc/client");
		const config = await uiToBackgroundClient.ai.getConfig.query();
		console.log("Loaded AI config from service worker:", {
			provider: config.provider,
		});
		return config;
	} catch (error) {
		console.error("Failed to load AI config from service worker:", error);
		console.log("Falling back to default config");
		return DEFAULT_CONFIG;
	}
}

/**
 * Load AI provider configuration from storage
 */
export async function loadAIConfigFromStorage(): Promise<AIProviderConfig> {
	try {
		// Check if we're in an environment with chrome.storage access
		if (
			typeof chrome === "undefined" ||
			!chrome.storage ||
			!chrome.storage.local
		) {
			console.log("Chrome storage API not available, using default config");
			return DEFAULT_CONFIG;
		}

		const result = await chrome.storage.local.get(AI_CONFIG_KEY);
		const stored = result[AI_CONFIG_KEY];

		if (stored?.provider && ["chrome", "claude"].includes(stored.provider)) {
			console.log("Loaded AI config:", { provider: stored.provider });
			return stored;
		}

		console.log("No valid AI config found, using default");
		return DEFAULT_CONFIG;
	} catch (error) {
		console.error("Failed to load AI config:", error);
		return DEFAULT_CONFIG;
	}
}

/**
 * Save AI provider configuration to storage
 */
export async function saveAIConfigToStorage(
	config: AIProviderConfig,
): Promise<void> {
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
	const config = await loadAIConfigFromStorage();
	if (config.provider === "claude") {
		await saveAIConfigToStorage({ ...config, claudeApiKey: apiKey });
	}
}

/**
 * Get Claude API key
 */
export async function getClaudeApiKey(): Promise<string | undefined> {
	const config = await loadAIConfigFromStorage();
	if (config.provider === "claude") {
		return config.claudeApiKey;
	}
	return undefined;
}
