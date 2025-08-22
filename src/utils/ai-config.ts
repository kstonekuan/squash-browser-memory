/**
 * AI Provider Configuration Management
 */

import { sidepanelToBackgroundClient } from "../trpc/client";
import type { AIProviderConfig } from "./ai-interface";
import {
	AI_CONFIG_KEY,
	createChromeStorage,
	getStorageData,
	setStorageData,
} from "./storage";

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
				["chrome", "claude", "gemini", "openai"].includes(data.provider)
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
export async function setClaudeApiKey(apiKey: string | null): Promise<void> {
	const config = await loadAIConfigFromStorage();

	if (config.provider === "claude") {
		if (apiKey) {
			// Update the key
			await saveAIConfigToStorage({ ...config, claudeApiKey: apiKey });
		} else {
			// Remove the key by saving config without it
			await saveAIConfigToStorage({ provider: "claude" });
		}
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
export async function setGeminiApiKey(apiKey: string | null): Promise<void> {
	const config = await loadAIConfigFromStorage();

	if (config.provider === "gemini") {
		if (apiKey) {
			// Update the key
			await saveAIConfigToStorage({ ...config, geminiApiKey: apiKey });
		} else {
			// Remove the key by saving config without it
			await saveAIConfigToStorage({ provider: "gemini" });
		}
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

/**
 * Set OpenAI API key
 */
export async function setOpenAIApiKey(apiKey: string | null): Promise<void> {
	const config = await loadAIConfigFromStorage();

	if (config.provider === "openai") {
		if (apiKey) {
			// Update the key
			await saveAIConfigToStorage({ ...config, openaiApiKey: apiKey });
		} else {
			// Remove the key by saving config without it
			await saveAIConfigToStorage({ provider: "openai" });
		}
	}
}

/**
 * Get OpenAI API key
 */
export async function getOpenAIApiKey(): Promise<string | undefined> {
	const config = await loadAIConfigFromStorage();
	if (config.provider === "openai") {
		return config.openaiApiKey;
	}
	return undefined;
}

/**
 * Set OpenAI base URL
 */
export async function setOpenAIBaseUrl(baseUrl: string | null): Promise<void> {
	const config = await loadAIConfigFromStorage();

	if (config.provider === "openai") {
		if (baseUrl) {
			// Update the base URL
			await saveAIConfigToStorage({ ...config, openaiBaseUrl: baseUrl });
		} else {
			// Remove the base URL by saving config without it
			const { openaiBaseUrl: _unused, ...configWithoutUrl } = config;
			await saveAIConfigToStorage(configWithoutUrl);
		}
	}
}

/**
 * Get OpenAI base URL
 */
export async function getOpenAIBaseUrl(): Promise<string | undefined> {
	const config = await loadAIConfigFromStorage();
	if (config.provider === "openai") {
		return config.openaiBaseUrl;
	}
	return undefined;
}

/**
 * Set OpenAI model
 */
export async function setOpenAIModel(model: string | null): Promise<void> {
	const config = await loadAIConfigFromStorage();

	if (config.provider === "openai") {
		if (model) {
			// Update the model
			await saveAIConfigToStorage({ ...config, openaiModel: model });
		} else {
			// Remove the model by saving config without it
			const { openaiModel: _unused, ...configWithoutModel } = config;
			await saveAIConfigToStorage(configWithoutModel);
		}
	}
}

/**
 * Get OpenAI model
 */
export async function getOpenAIModel(): Promise<string | undefined> {
	const config = await loadAIConfigFromStorage();
	if (config.provider === "openai") {
		return config.openaiModel;
	}
	return undefined;
}
