import type { MemorySettings } from "../types";

// Settings key for memory management configuration
const MEMORY_SETTINGS_KEY = "memory_settings";

// Default memory settings - workflow patterns enabled by default (current behavior)
const defaultMemorySettings: MemorySettings = {
	storeWorkflowPatterns: true,
};

// Load memory settings
export async function loadMemorySettings(): Promise<MemorySettings> {
	try {
		const result = await chrome.storage.local.get(MEMORY_SETTINGS_KEY);
		const loaded = {
			...defaultMemorySettings,
			...(result[MEMORY_SETTINGS_KEY] || {}),
		};
		console.log(
			"🔧 Loading memory settings from storage:",
			result[MEMORY_SETTINGS_KEY],
		);
		console.log("🔧 Final loaded settings:", loaded);
		return loaded;
	} catch (error) {
		console.error("Failed to load memory settings:", error);
		return defaultMemorySettings;
	}
}

// Save memory settings
export async function saveMemorySettings(
	settings: MemorySettings,
): Promise<void> {
	try {
		await chrome.storage.local.set({
			[MEMORY_SETTINGS_KEY]: settings,
		});
		console.log("Memory settings saved:", settings);
	} catch (error) {
		console.error("Failed to save memory settings:", error);
	}
}
