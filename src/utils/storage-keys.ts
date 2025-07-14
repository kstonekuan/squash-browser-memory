import type { AnalysisMemory, MemorySettings } from "../types";
import type { AIProviderConfig } from "./ai-interface";
import type { AutoAnalysisSettings } from "./ambient";

interface CustomPrompts {
	systemPrompt?: string;
	chunkPrompt?: string;
	mergePrompt?: string;
}

export const MEMORY_KEY = "history_analysis_memory";
export const MEMORY_SETTINGS_KEY = "memory_settings";
export const AI_CONFIG_KEY = "ai_provider_config";
export const AUTO_ANALYSIS_SETTINGS_KEY = "auto_analysis_settings";
export const CUSTOM_PROMPTS_KEY = "custom_prompts";

export interface StorageSchema {
	[MEMORY_KEY]: AnalysisMemory;
	[MEMORY_SETTINGS_KEY]: MemorySettings;
	[AI_CONFIG_KEY]: AIProviderConfig;
	[AUTO_ANALYSIS_SETTINGS_KEY]: AutoAnalysisSettings;
	[CUSTOM_PROMPTS_KEY]: CustomPrompts;
}

export const storageKeys: (keyof StorageSchema)[] = [
	MEMORY_KEY,
	MEMORY_SETTINGS_KEY,
	AI_CONFIG_KEY,
	AUTO_ANALYSIS_SETTINGS_KEY,
	CUSTOM_PROMPTS_KEY,
];

export type StorageKey = keyof StorageSchema;
