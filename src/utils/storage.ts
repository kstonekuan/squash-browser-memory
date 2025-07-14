/**
 * SuperJSON-enhanced Chrome Storage utilities
 * Provides type-safe storage with automatic Date serialization
 */

import { err, ok, ResultAsync } from "neverthrow";
import superjson from "superjson";
import type { StorageKey, StorageSchema } from "./storage-keys";

/**
 * Create a Chrome storage instance if available
 * Returns null if Chrome storage API is not available
 */
export function createChromeStorage(): chrome.storage.StorageArea | null {
	if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
		return chrome.storage.local;
	}
	return null;
}

/**
 * Store data in Chrome storage with SuperJSON serialization
 * Automatically handles Date objects and other complex types
 */
export function setStorageData<K extends StorageKey>(
	handle: chrome.storage.StorageArea,
	key: K,
	value: StorageSchema[K],
): ResultAsync<void, Error> {
	try {
		const serialized = superjson.stringify(value);
		return ResultAsync.fromPromise(
			handle.set({ [key]: serialized }),
			(error) => {
				// Check if it's a quota exceeded error
				if (error instanceof Error && error.message.includes("quota")) {
					return new Error(`Storage quota exceeded`, { cause: error });
				}
				return new Error(`Failed to save to storage`, { cause: error });
			},
		);
	} catch (error) {
		// Serialization failed
		return ResultAsync.fromSafePromise(
			Promise.reject(new Error(`Failed to serialize data`, { cause: error })),
		);
	}
}

/**
 * Retrieve data from Chrome storage with SuperJSON deserialization
 * Automatically restores Date objects and other complex types
 */
export function getStorageData<K extends StorageKey>(
	handle: chrome.storage.StorageArea,
	key: K,
): ResultAsync<StorageSchema[K] | null, Error> {
	return ResultAsync.fromPromise(
		handle.get(key),
		(error) => new Error(`Failed to access storage`, { cause: error }),
	).andThen((result) => {
		if (!result[key]) {
			return ok(null);
		}

		try {
			const data = superjson.parse<StorageSchema[K]>(result[key]);
			return ok(data);
		} catch (error) {
			console.warn(`Failed to deserialize storage data for key "${key}"`);
			return err(new Error(`Failed to parse storage data`, { cause: error }));
		}
	});
}

/**
 * Remove data from Chrome storage
 */
export function removeStorageData(
	handle: chrome.storage.StorageArea,
	key: string,
): ResultAsync<void, Error> {
	return ResultAsync.fromPromise(
		handle.remove(key),
		(error) =>
			new Error(`Failed to remove storage key ${key}`, { cause: error }),
	);
}

/**
 * Check if raw data exists in storage (without deserialization)
 * Useful for detecting corrupted data
 */
export function hasStorageData(
	handle: chrome.storage.StorageArea,
	key: string,
): ResultAsync<boolean, Error> {
	return ResultAsync.fromPromise(
		handle.get(key),
		(error) =>
			new Error(`Failed to check storage key ${key}`, { cause: error }),
	).map((result) => result[key] !== undefined);
}
