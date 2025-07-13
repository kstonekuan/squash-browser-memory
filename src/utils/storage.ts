/**
 * SuperJSON-enhanced Chrome Storage utilities
 * Provides type-safe storage with automatic Date serialization
 */

import superjson from "superjson";

/**
 * Store data in Chrome storage with SuperJSON serialization
 * Automatically handles Date objects and other complex types
 */
export async function setStorageData<T>(key: string, value: T): Promise<void> {
	const serialized = superjson.stringify(value);
	await chrome.storage.local.set({ [key]: serialized });
}

/**
 * Retrieve data from Chrome storage with SuperJSON deserialization
 * Automatically restores Date objects and other complex types
 */
export async function getStorageData<T>(key: string): Promise<T | null> {
	const result = await chrome.storage.local.get(key);
	if (!result[key]) return null;

	try {
		return superjson.parse(result[key]) as T;
	} catch (error) {
		console.warn(`Failed to deserialize storage data for key "${key}":`, error);
		return null;
	}
}

/**
 * Remove data from Chrome storage
 */
export async function removeStorageData(key: string): Promise<void> {
	await chrome.storage.local.remove(key);
}
