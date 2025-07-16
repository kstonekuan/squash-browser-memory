/**
 * Utility to clear corrupted storage data
 * Run this in the background script to fix storage issues
 */

import {
	createChromeStorage,
	getStorageData,
	hasStorageData,
	removeStorageData,
	storageKeys,
} from "./storage";

/**
 * Check and clear all corrupted storage data
 * A key is considered corrupted if:
 * 1. Raw data exists in storage
 * 2. But SuperJSON fails to parse it
 */
export async function clearCorruptedStorage(): Promise<{
	cleaned: string[];
	errors: string[];
}> {
	const storage = createChromeStorage();
	if (!storage) {
		console.log("[Storage] Chrome storage not available");
		return { cleaned: [], errors: [] };
	}

	const cleaned: string[] = [];
	const errors: string[] = [];

	// Check each storage key with its proper type
	const checks = storageKeys.map((key) => ({
		key,
		name: key.replaceAll("_", " "),
		check: () => getStorageData(storage, key),
	}));

	for (const { key, name, check } of checks) {
		try {
			// Try to load using SuperJSON-enabled storage utilities with proper type
			const result = await check();

			// If parsing failed with an error (not just not-found)
			if (result.isErr()) {
				// Check if raw data exists to confirm it's corrupted
				const hasDataResult = await hasStorageData(storage, key);
				const hasData = hasDataResult.match(
					(exists) => exists,
					() => false,
				);

				if (hasData) {
					console.log(`[Storage] Found corrupted ${name} data, clearing...`);
					const removeResult = await removeStorageData(storage, key);
					if (removeResult.isErr()) {
						console.error(
							`[Storage] Failed to remove corrupted ${name}:`,
							removeResult.error,
						);
						errors.push(`${name}: ${removeResult.error.message}`);
					} else {
						console.log(`[Storage] Corrupted ${name} data cleared`);
						cleaned.push(name);
					}
				}
			}
			// If data was successfully parsed, it's not corrupted
		} catch (error) {
			console.error(`[Storage] Error checking ${name}:`, error);
			errors.push(
				`${name}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	if (cleaned.length > 0) {
		console.log("[Storage] Cleaned corrupted data:", cleaned);
	}
	if (errors.length > 0) {
		console.error("[Storage] Errors during cleanup:", errors);
	}
	if (cleaned.length === 0 && errors.length === 0) {
		console.log("[Storage] No corrupted data found");
	}

	return { cleaned, errors };
}
