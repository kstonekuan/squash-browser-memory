import { writable } from "svelte/store";
import type { AutoAnalysisSettings } from "../utils/ambient";
import {
	AUTO_ANALYSIS_SETTINGS_KEY,
	loadAutoAnalysisSettings,
	saveAutoAnalysisSettings,
} from "../utils/ambient";
import { sendMessage } from "../utils/messaging";

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
	// Get current settings first
	let currentSettings: AutoAnalysisSettings;
	const unsubscribe = ambientSettings.subscribe((s) => {
		currentSettings = s;
	});
	unsubscribe();

	const newEnabled = !currentSettings!.enabled;

	// Update settings - if enabling, clear lastRunTimestamp to show "first run"
	ambientSettings.update((settings) => ({
		...settings,
		enabled: newEnabled,
		// Clear timestamp when enabling so UI shows "First analysis will run in 1 minute"
		...(newEnabled ? { lastRunTimestamp: undefined } : {}),
	}));

	// Send message to background script
	try {
		const response = await sendMessage("settings:toggle-auto-analysis", {
			enabled: newEnabled,
		});

		if (!response?.success) {
			// Revert on error
			ambientSettings.update((settings) => ({
				...settings,
				enabled: !newEnabled,
				// Restore previous timestamp if reverting
				lastRunTimestamp: currentSettings!.lastRunTimestamp,
			}));
			throw new Error(response?.error || "Failed to update auto-analysis");
		}

		// If we have the actual next run time from the alarm, store it
		if (response.nextRunTime && newEnabled) {
			ambientSettings.update((settings) => ({
				...settings,
				nextAlarmTime: response.nextRunTime,
			}));
		}
	} catch (error) {
		// Revert on error
		ambientSettings.update((settings) => ({
			...settings,
			enabled: !newEnabled,
			lastRunTimestamp: currentSettings!.lastRunTimestamp,
		}));
		throw error;
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
