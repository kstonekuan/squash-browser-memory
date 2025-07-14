import { sidepanelToBackgroundClient } from "../trpc/client";
import type { AutoAnalysisSettings } from "../utils/ambient";
import {
	defaultAutoAnalysisSettings,
	loadAutoAnalysisSettings,
	saveAutoAnalysisSettings,
} from "../utils/ambient";
import { AUTO_ANALYSIS_SETTINGS_KEY } from "../utils/storage-keys";

// Create reactive state using runes
let ambientSettingsState = $state<AutoAnalysisSettings>(
	defaultAutoAnalysisSettings,
);
let isUpdatingFromStorage = false;

// Initialize settings
loadAutoAnalysisSettings().then((settings) => {
	ambientSettingsState = settings;
});

// Listen for storage changes to keep the state in sync
chrome.storage.onChanged.addListener((changes, areaName) => {
	if (areaName === "local" && changes[AUTO_ANALYSIS_SETTINGS_KEY]) {
		// Re-load settings using the proper deserialization
		isUpdatingFromStorage = true;
		loadAutoAnalysisSettings().then((settings) => {
			ambientSettingsState = settings;
			isUpdatingFromStorage = false;
		});
	}
});

export function updateAmbientSettings(
	updates: Partial<AutoAnalysisSettings>,
): void {
	ambientSettingsState = {
		...ambientSettingsState,
		...updates,
	};

	// Save to storage if not updating from storage
	// Remove the isInitialized check - we should always save user-initiated changes
	if (!isUpdatingFromStorage) {
		saveAutoAnalysisSettings(ambientSettingsState).catch((error) => {
			console.error("Failed to save ambient settings:", error);
		});
	}
}

// Helper function to toggle ambient analysis
export async function toggleAmbientAnalysis(): Promise<void> {
	const currentSettings = ambientSettingsState;
	const newEnabled = !currentSettings.enabled;

	// Update settings - if enabling, clear lastRunTimestamp to show "first run"
	const newSettings: Partial<AutoAnalysisSettings> = {
		enabled: newEnabled,
		// Clear timestamp when enabling so UI shows "First analysis will run in 1 minute"
		...(newEnabled ? { lastRunTimestamp: undefined } : {}),
	};

	// Use updateAmbientSettings to ensure saving
	updateAmbientSettings(newSettings);

	// Send message to background script
	const response =
		await sidepanelToBackgroundClient.settings.toggleAutoAnalysis.mutate({
			enabled: newEnabled,
		});

	if (!response?.success) {
		// Revert on error using updateAmbientSettings
		updateAmbientSettings({
			enabled: !newEnabled,
			// Restore previous timestamp if reverting
			lastRunTimestamp: currentSettings.lastRunTimestamp,
		});
		throw new Error(response?.error || "Failed to update auto-analysis");
	}
}

// Helper function to disable ambient analysis (used when AI becomes unavailable)
export async function disableAmbientAnalysis(): Promise<void> {
	const currentSettings = ambientSettingsState;

	// Only proceed if it's currently enabled
	if (!currentSettings.enabled) {
		return;
	}

	// Update settings to disabled using updateAmbientSettings
	updateAmbientSettings({ enabled: false });

	// Send message to background script to clear alarms
	const response =
		await sidepanelToBackgroundClient.settings.toggleAutoAnalysis.mutate({
			enabled: false,
		});

	if (!response?.success) {
		// Revert on error using updateAmbientSettings
		updateAmbientSettings({ enabled: true });
		throw new Error(response?.error || "Failed to disable auto-analysis");
	}
}

export function getAmbientSettings(): AutoAnalysisSettings {
	return ambientSettingsState;
}
