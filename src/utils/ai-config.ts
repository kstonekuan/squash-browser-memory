/**
 * AI Provider Configuration Management
 */

import { sidepanelToBackgroundClient } from "../trpc/client";
import type { AIProviderConfig } from "./ai-interface";
import { createChromeStorage, getStorageData, setStorageData } from "./storage";

import { AI_CONFIG_KEY } from "./storage-keys";

const DEFAULT_CONFIG: AIProviderConfig = {
	provider: "chrome",
};

/**
 * Load AI config for offscreen context by communicating with the service worker
 */
export async function loadAIConfigFromServiceWorker(): Promise<AIProviderConfig> {
	try {
		const config = await sidepanelToBackgroundClient.ai.getConfig.query();
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
	// Create storage handle
	const storage = createChromeStorage();
	if (!storage) {
		console.log("Chrome storage API not available, using default config");
		return DEFAULT_CONFIG;
	}

	const result = await getStorageData(storage, AI_CONFIG_KEY);

	return result.match(
		(data) => {
			if (!data) {
				console.log("No AI config found, using default");
				return DEFAULT_CONFIG;
			}

			if (
				data?.provider &&
				["chrome", "claude", "gemini"].includes(data.provider)
			) {
				console.log("Loaded AI config:", { provider: data.provider });
				return data;
			}

			console.log("Invalid AI config found, using default");
			return DEFAULT_CONFIG;
		},
		(error) => {
			console.error("Failed to load AI config:", error);
			return DEFAULT_CONFIG;
		},
	);
}

/**
 * Save AI provider configuration to storage
 */
export async function saveAIConfigToStorage(
	config: AIProviderConfig,
): Promise<void> {
	const storage = createChromeStorage();
	if (!storage) {
		console.log("Chrome storage API not available, cannot save AI config");
		return;
	}

	const saveResult = await setStorageData(storage, AI_CONFIG_KEY, config);

	saveResult.match(
		() => console.log("Saved AI config:", { provider: config.provider }),
		(error) => console.error("Failed to save AI config:", error),
	);
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

/**
 * Set Gemini API key
 */
export async function setGeminiApiKey(apiKey: string): Promise<void> {
	const config = await loadAIConfigFromStorage();
	if (config.provider === "gemini") {
		await saveAIConfigToStorage({ ...config, geminiApiKey: apiKey });
	}
}

/**
 * Get Gemini API key
 */
export async function getGeminiApiKey(): Promise<string | undefined> {
	const config = await loadAIConfigFromStorage();
	if (config.provider === "gemini") {
		return config.geminiApiKey;
	}
	return undefined;
}
