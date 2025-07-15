import type {
	AnalysisMemory,
	CustomPrompts,
	FullAnalysisResult,
	MemorySettings,
} from "../types";
import type { AIProviderConfig } from "./ai-interface";
import type { AutoAnalysisSettings } from "./ambient";

export const MEMORY_KEY = "history_analysis_memory";
export const MEMORY_SETTINGS_KEY = "memory_settings";
export const AI_CONFIG_KEY = "ai_provider_config";
export const AUTO_ANALYSIS_SETTINGS_KEY = "auto_analysis_settings";
export const CUSTOM_PROMPTS_KEY = "custom_prompts";
export const LAST_ANALYSIS_RESULT_KEY = "last_analysis_result";

export interface StorageSchema {
	[MEMORY_KEY]: AnalysisMemory;
	[MEMORY_SETTINGS_KEY]: MemorySettings;
	[AI_CONFIG_KEY]: AIProviderConfig;
	[AUTO_ANALYSIS_SETTINGS_KEY]: AutoAnalysisSettings;
	[CUSTOM_PROMPTS_KEY]: CustomPrompts;
	[LAST_ANALYSIS_RESULT_KEY]: FullAnalysisResult | null;
}

export const storageKeys: (keyof StorageSchema)[] = [
	MEMORY_KEY,
	MEMORY_SETTINGS_KEY,
	AI_CONFIG_KEY,
	AUTO_ANALYSIS_SETTINGS_KEY,
	CUSTOM_PROMPTS_KEY,
	LAST_ANALYSIS_RESULT_KEY,
];

export type StorageKey = keyof StorageSchema;
