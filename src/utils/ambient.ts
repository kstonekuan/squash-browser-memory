/// <reference types="@types/dom-chromium-ai" />

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
const defaultAutoAnalysisSettings: AutoAnalysisSettings = {
	enabled: false,
	notifyOnSuccess: false,
	notifyOnError: false,
};

// Load auto-analysis settings
export async function loadAutoAnalysisSettings(): Promise<AutoAnalysisSettings> {
	const result = await chrome.storage.local.get(AUTO_ANALYSIS_SETTINGS_KEY);
	return {
		...defaultAutoAnalysisSettings,
		...(result[AUTO_ANALYSIS_SETTINGS_KEY] || {}),
	};
}

// Save auto-analysis settings
export async function saveAutoAnalysisSettings(
	settings: AutoAnalysisSettings,
): Promise<void> {
	await chrome.storage.local.set({
		[AUTO_ANALYSIS_SETTINGS_KEY]: settings,
	});
}
