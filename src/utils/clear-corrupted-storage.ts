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
		// If it fails or returns null, the data is corrupted
		const memory = await getStorageData<AnalysisMemory>(MEMORY_KEY);

		// If getStorageData returns null, it could be:
		// 1. No data exists (which is fine)
		// 2. Data exists but failed to parse (corrupted)
		// We need to check if raw data exists
		const result = await chrome.storage.local.get(MEMORY_KEY);
		const hasData = result[MEMORY_KEY] !== undefined;

		// If data exists but getStorageData returned null, it's corrupted
		if (hasData && !memory) {
			console.log("[Storage] Found corrupted memory data, clearing...");
			await removeStorageData(MEMORY_KEY);
			console.log("[Storage] Corrupted memory data cleared");
			return true;
		}

		return false;
	} catch (error) {
		console.error("[Storage] Error checking corrupted memory:", error);
		return false;
	}
}
