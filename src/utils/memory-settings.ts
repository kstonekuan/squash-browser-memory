import type { MemorySettings } from "../types";
// Settings key for memory management configuration
import {
	createChromeStorage,
	getStorageData,
	MEMORY_SETTINGS_KEY,
	setStorageData,
} from "./storage";

// Default memory settings - workflow patterns disabled by default
const defaultMemorySettings: MemorySettings = {
	storeWorkflowPatterns: false,
};

// Load memory settings
export async function loadMemorySettings(): Promise<MemorySettings> {
	const storage = createChromeStorage();
	if (!storage) {
		console.log("🔧 Chrome storage not available, using defaults");
		return defaultMemorySettings;
	}

	const result = await getStorageData(storage, MEMORY_SETTINGS_KEY);

	return result.match(
		(data) => {
			if (!data) {
				console.log("🔧 No memory settings found, using defaults");
				return defaultMemorySettings;
			}

			const loaded = {
				...defaultMemorySettings,
				...data,
			};
			console.log("🔧 Loaded memory settings:", loaded);
			return loaded;
		},
		(error) => {
			console.error("Failed to load memory settings:", error);
			return defaultMemorySettings;
		},
	);
}

// Save memory settings
export async function saveMemorySettings(
	settings: MemorySettings,
): Promise<void> {
	const storage = createChromeStorage();
	if (!storage) {
		console.log("🔧 Chrome storage not available, cannot save settings");
		return;
	}

	const saveResult = await setStorageData(
		storage,
		MEMORY_SETTINGS_KEY,
		settings,
	);

	saveResult.match(
		() => console.log("Memory settings saved:", settings),
		(error) => console.error("Failed to save memory settings:", error),
	);
}
