import { writable } from "svelte/store";
import type { AutoAnalysisSettings } from "../utils/ambient";
import {
	AUTO_ANALYSIS_SETTINGS_KEY,
	loadAutoAnalysisSettings,
	saveAutoAnalysisSettings,
} from "../utils/ambient";

// Default settings
const defaultSettings: AutoAnalysisSettings = {
	enabled: false,
	notifyOnSuccess: true,
	notifyOnError: true,
};

// Create the store
export const ambientSettings = writable<AutoAnalysisSettings>(defaultSettings);

// Load initial settings
loadAutoAnalysisSettings().then((settings) => {
	ambientSettings.set(settings);
});

// Subscribe to changes and save
let isUpdatingFromStorage = false;
ambientSettings.subscribe(async (settings) => {
	// Skip saving default settings on initialization or when updating from storage
	if (settings === defaultSettings || isUpdatingFromStorage) return;

	try {
		await saveAutoAnalysisSettings(settings);
	} catch (error) {
		console.error("Failed to save ambient settings:", error);
	}
});

// Listen for storage changes to keep the store in sync
chrome.storage.onChanged.addListener((changes, areaName) => {
	if (areaName === "local" && changes[AUTO_ANALYSIS_SETTINGS_KEY]) {
		const newSettings = changes[AUTO_ANALYSIS_SETTINGS_KEY].newValue;
		if (newSettings) {
			isUpdatingFromStorage = true;
			ambientSettings.set(newSettings);
			isUpdatingFromStorage = false;
		}
	}
});

// Helper function to toggle ambient analysis
export async function toggleAmbientAnalysis(): Promise<void> {
	ambientSettings.update((settings) => ({
		...settings,
		enabled: !settings.enabled,
	}));

	// Get current settings
	let currentSettings: AutoAnalysisSettings;
	const unsubscribe = ambientSettings.subscribe((s) => {
		currentSettings = s;
	});
	unsubscribe();

	// Send message to background script
	const response = await chrome.runtime.sendMessage({
		type: "toggle-auto-analysis",
		enabled: currentSettings!.enabled,
	});

	if (!response?.success) {
		// Revert on error
		ambientSettings.update((settings) => ({
			...settings,
			enabled: !settings.enabled,
		}));
		throw new Error(response?.error || "Failed to update auto-analysis");
	}
}

// Helper function to update settings
export async function updateAmbientSettings(
	updates: Partial<AutoAnalysisSettings>,
): Promise<void> {
	ambientSettings.update((settings) => ({
		...settings,
		...updates,
	}));
}
