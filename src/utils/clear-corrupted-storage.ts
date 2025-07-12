/**
 * Utility to clear corrupted storage data
 * Run this in the background script to fix storage issues
 */

export async function clearCorruptedMemory() {
	const MEMORY_KEY = "history_analysis_memory";

	try {
		const result = await chrome.storage.local.get(MEMORY_KEY);
		const stored = result[MEMORY_KEY];

		// Check if the storage is corrupted (stored as string "[object Object]")
		if (typeof stored === "string" && stored === "[object Object]") {
			console.log("[Storage] Found corrupted memory data, clearing...");
			await chrome.storage.local.remove(MEMORY_KEY);
			console.log("[Storage] Corrupted memory data cleared");
			return true;
		}

		// Also check if it's an invalid JSON string
		if (typeof stored === "string") {
			try {
				const parsed = JSON.parse(stored);
				// Check if it's NOT SuperJSON format (missing json and meta properties)
				if (!parsed.json || !parsed.meta) {
					console.log("[Storage] Found non-SuperJSON data, needs migration...");
					// This is legacy data that needs to be cleared
					await chrome.storage.local.remove(MEMORY_KEY);
					console.log("[Storage] Legacy memory data cleared for migration");
					return true;
				}
			} catch {
				console.log("[Storage] Found invalid JSON in memory data, clearing...");
				await chrome.storage.local.remove(MEMORY_KEY);
				console.log("[Storage] Invalid memory data cleared");
				return true;
			}
		}

		// Check if stored data is plain object (not SuperJSON serialized)
		if (stored && typeof stored === "object" && !stored.json) {
			console.log(
				"[Storage] Found legacy non-SuperJSON memory data, clearing...",
			);
			await chrome.storage.local.remove(MEMORY_KEY);
			console.log("[Storage] Legacy memory data cleared");
			return true;
		}

		return false;
	} catch (error) {
		console.error("[Storage] Error checking corrupted memory:", error);
		return false;
	}
}
