/**
 * SuperJSON-enhanced Chrome Storage utilities
 * Provides type-safe storage with automatic Date serialization
 */

import { err, ok, ResultAsync } from "neverthrow";
import superjson from "superjson";

/**
 * Store data in Chrome storage with SuperJSON serialization
 * Automatically handles Date objects and other complex types
 */
export function setStorageData<T>(
	key: string,
	value: T,
): ResultAsync<void, Error> {
	try {
		const serialized = superjson.stringify(value);
		return ResultAsync.fromPromise(
			chrome.storage.local.set({ [key]: serialized }),
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
export function getStorageData<T>(
	key: string,
): ResultAsync<{ type: "found"; data: T } | { type: "not-found" }, Error> {
	return ResultAsync.fromPromise(
		chrome.storage.local.get(key),
		(error) => new Error(`Failed to access storage`, { cause: error }),
	).andThen((result) => {
		if (!result[key]) {
			return ok({ type: "not-found" as const });
		}

		try {
			const data = superjson.parse(result[key]) as T;
			return ok({ type: "found" as const, data });
		} catch (error) {
			console.warn(`Failed to deserialize storage data for key "${key}"`);
			return err(new Error(`Failed to parse storage data`, { cause: error }));
		}
	});
}

/**
 * Remove data from Chrome storage
 */
export function removeStorageData(key: string): ResultAsync<void, Error> {
	return ResultAsync.fromPromise(
		chrome.storage.local.remove(key),
		(error) =>
			new Error(`Failed to remove storage key ${key}`, { cause: error }),
	);
}
