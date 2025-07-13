/**
 * Utility to clear corrupted storage data
 * Run this in the background script to fix storage issues
 */

import type { AnalysisMemory } from "../types";
import { getStorageData, removeStorageData } from "./storage";

export async function clearCorruptedMemory() {
	const MEMORY_KEY = "history_analysis_memory";

	try {
		// Try to load using SuperJSON-enabled storage utilities
		const memoryResult = await getStorageData<AnalysisMemory>(MEMORY_KEY);

		// If it failed with an error (not just not-found), the data might be corrupted
		if (memoryResult.isErr()) {
			// Check if raw data exists to confirm it's corrupted
			const result = await chrome.storage.local.get(MEMORY_KEY);
			const hasData = result[MEMORY_KEY] !== undefined;

			if (hasData) {
				console.log("[Storage] Found corrupted memory data, clearing...");
				const removeResult = await removeStorageData(MEMORY_KEY);
				if (removeResult.isErr()) {
					console.error(
						"[Storage] Failed to remove corrupted data:",
						removeResult.error,
					);
					return false;
				}
				console.log("[Storage] Corrupted memory data cleared");
				return true;
			}
		}

		return false;
	} catch (error) {
		console.error("[Storage] Error checking corrupted memory:", error);
		return false;
	}
}
