import { offscreenToBackgroundClient } from "../trpc/client";
import type { AnalysisMemory } from "../types";
import {
	createChromeStorage,
	getStorageData,
	removeStorageData,
	setStorageData,
} from "./storage";

// Chunk of history for processing
export interface HistoryChunk {
	startTime: Date;
	endTime: Date;
	items: chrome.history.HistoryItem[];
	chunkIndex: number;
	totalChunks: number;
	isFallback?: boolean;
}

import { MEMORY_KEY } from "./storage-keys";

const MEMORY_VERSION = "2.0.0"; // Clean version without legacy support

// Initialize empty memory
export function createEmptyMemory(): AnalysisMemory {
	return {
		userProfile: {
			stableTraits: {
				coreIdentities: [],
				personalPreferences: [],
			},
			dynamicContext: {
				currentTasks: [],
				currentInterests: [],
			},
			summary: "No profile data yet.",
		},
		patterns: [],
		lastAnalyzedDate: new Date(0), // Start from epoch
		lastHistoryTimestamp: 0, // No history analyzed yet
		version: MEMORY_VERSION,
	};
}

/**
 * Load memory via service worker message passing (for offscreen documents)
 * SuperJSON automatically handles Date deserialization through tRPC
 */
export async function loadMemoryFromServiceWorker(): Promise<AnalysisMemory | null> {
	try {
		const memory = await offscreenToBackgroundClient.memory.read.query();
		if (!memory) return null;

		// SuperJSON via tRPC automatically handles Date deserialization
		return memory;
	} catch (error) {
		console.error("[Memory] Failed to load memory via service worker:", error);
		return null;
	}
}

/**
 * Load memory from Chrome storage using SuperJSON
 */
export async function loadMemoryFromStorage(): Promise<AnalysisMemory | null> {
	// Create storage instance
	const storage = createChromeStorage();
	if (!storage) {
		console.log("Chrome storage API not available for memory, returning null");
		return null;
	}

	const storageResult = await getStorageData(storage, MEMORY_KEY);

	return storageResult.match(
		(data) => {
			if (!data) {
				console.log("No existing memory found in chrome.storage.local");
				return null;
			}

			// Check version compatibility
			if (data.version !== MEMORY_VERSION) {
				console.log(
					`Memory version mismatch (${data.version} !== ${MEMORY_VERSION}), creating new memory`,
				);
				return null;
			}

			console.log("Loaded memory from chrome.storage.local:", {
				patterns: data.patterns.length,
				lastAnalyzed: data.lastAnalyzedDate,
				lastAnalyzedType: typeof data.lastAnalyzedDate,
				lastAnalyzedIsDate: data.lastAnalyzedDate instanceof Date,
				lastHistoryTimestamp: data.lastHistoryTimestamp,
			});
			return data;
		},
		(error) => {
			console.error("Failed to load memory from storage:", error);
			return null;
		},
	);
}

/**
 * Save memory via service worker message passing (for offscreen documents)
 */
export async function saveMemoryToServiceWorker(
	memory: AnalysisMemory,
): Promise<void> {
	try {
		await offscreenToBackgroundClient.memory.write.mutate({ memory });
	} catch (error) {
		console.error("[Memory] Failed to save memory via service worker:", error);
	}
}

/**
 * Save memory to Chrome storage using SuperJSON
 */
export async function saveMemoryToStorage(
	memory: AnalysisMemory,
): Promise<void> {
	// Create storage instance
	const storage = createChromeStorage();
	if (!storage) {
		console.log("Chrome storage API not available for saving memory, skipping");
		return;
	}

	// SuperJSON handles Date serialization automatically
	const saveResult = await setStorageData(storage, MEMORY_KEY, memory);

	saveResult.match(
		() => {
			console.log("[Memory] Saved to chrome.storage.local:", {
				key: MEMORY_KEY,
				patterns: memory.patterns.length,
				lastAnalyzedDate: memory.lastAnalyzedDate,
				lastAnalyzedType: typeof memory.lastAnalyzedDate,
				lastAnalyzedIsDate: memory.lastAnalyzedDate instanceof Date,
				lastHistoryTimestamp: memory.lastHistoryTimestamp,
				userProfile: {
					coreIdentities:
						memory.userProfile?.stableTraits?.coreIdentities?.length || 0,
					currentTasks:
						memory.userProfile?.dynamicContext?.currentTasks?.length || 0,
					summary: memory.userProfile?.summary || "No summary",
				},
			});
		},
		(error) => {
			console.error("Failed to save memory:", error);
		},
	);
}

/**
 * Clear memory from Chrome storage using SuperJSON storage utilities
 */
export async function clearMemoryFromStorage(): Promise<void> {
	// Create storage instance
	const storage = createChromeStorage();
	if (!storage) {
		console.log(
			"Chrome storage API not available for clearing memory, skipping",
		);
		return;
	}

	const removeResult = await removeStorageData(storage, MEMORY_KEY);

	removeResult.match(
		() => console.log("Analysis memory cleared from chrome.storage.local"),
		(error) => console.error("Failed to clear memory from storage:", error),
	);
}
