/// <reference types="@types/dom-chromium-ai" />

import { createChromeStorage, getStorageData, setStorageData } from "./storage";

// Settings key for auto-analysis configuration
export const AUTO_ANALYSIS_SETTINGS_KEY = "auto_analysis_settings";

export interface AutoAnalysisSettings {
	enabled: boolean;
	notifyOnSuccess: boolean;
	notifyOnError: boolean;
	lastRunTimestamp?: number;
	lastRunStatus?: "success" | "error";
	lastRunError?: string;
	nextAlarmTime?: number; // Actual scheduled Chrome alarm time
}

// Default settings
export const defaultAutoAnalysisSettings: AutoAnalysisSettings = {
	enabled: false,
	notifyOnSuccess: false,
	notifyOnError: false,
};

// Load auto-analysis settings
export async function loadAutoAnalysisSettings(): Promise<AutoAnalysisSettings> {
	const storage = createChromeStorage();
	if (!storage) {
		return defaultAutoAnalysisSettings;
	}

	const result = await getStorageData<AutoAnalysisSettings>(
		storage,
		AUTO_ANALYSIS_SETTINGS_KEY,
	);

	return result.match(
		(data) => {
			if (!data) {
				return defaultAutoAnalysisSettings;
			}
			return {
				...defaultAutoAnalysisSettings,
				...data,
			};
		},
		(error) => {
			console.error("Failed to load auto-analysis settings:", error);
			return defaultAutoAnalysisSettings;
		},
	);
}

// Save auto-analysis settings
export async function saveAutoAnalysisSettings(
	settings: AutoAnalysisSettings,
): Promise<void> {
	const storage = createChromeStorage();
	if (!storage) {
		return;
	}

	const saveResult = await setStorageData<AutoAnalysisSettings>(
		storage,
		AUTO_ANALYSIS_SETTINGS_KEY,
		settings,
	);

	saveResult.match(
		() => {}, // Success - no log needed
		(error) => console.error("Failed to save auto-analysis settings:", error),
	);
}
