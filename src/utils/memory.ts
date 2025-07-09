import { format, isValid, parseISO } from "date-fns";
import { offscreenTrpc as trpc } from "../trpc/client";
import type { AnalysisMemory } from "../types";

// Chunk of history for processing
export interface HistoryChunk {
	startTime: Date;
	endTime: Date;
	items: chrome.history.HistoryItem[];
	chunkIndex: number;
	totalChunks: number;
	isFallback?: boolean;
}

const MEMORY_KEY = "history_analysis_memory";
const MEMORY_VERSION = "1.5.0"; // Nested structure: stableTraits and dynamicContext

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
 */
export async function loadMemoryFromServiceWorker(): Promise<AnalysisMemory | null> {
	try {
		const memory = await trpc.memory.read.query();
		if (!memory) return null;

		// Convert date string back to Date object if needed
		// tRPC serializes dates as strings, so we need to parse them
		const parsedMemory: AnalysisMemory = {
			...memory,
			lastAnalyzedDate:
				typeof memory.lastAnalyzedDate === "string"
					? parseISO(memory.lastAnalyzedDate)
					: memory.lastAnalyzedDate,
		};

		return parsedMemory;
	} catch (error) {
		console.error("[Memory] Failed to load memory via service worker:", error);
		return null;
	}
}

/**
 * Load memory from Chrome storage
 */
export async function loadMemoryFromStorage(): Promise<AnalysisMemory | null> {
	try {
		// Check if we're in an environment with chrome.storage access
		if (
			typeof chrome === "undefined" ||
			!chrome.storage ||
			!chrome.storage.local
		) {
			console.log(
				"Chrome storage API not available for memory, returning null",
			);
			return null;
		}

		const result = await chrome.storage.local.get(MEMORY_KEY);
		const stored = result[MEMORY_KEY];

		if (!stored) {
			console.log("No existing memory found in chrome.storage.local");
			return null;
		}

		// Convert date strings back to Date objects
		const dateValue = stored.lastAnalyzedDate;
		console.log(
			"Raw dateValue from storage:",
			dateValue,
			"Type:",
			typeof dateValue,
		);

		// Handle different possible date formats using date-fns
		let parsedDate: Date;
		if (dateValue instanceof Date) {
			// Already a Date object
			parsedDate = dateValue;
		} else if (typeof dateValue === "string") {
			// ISO string from JSON serialization
			parsedDate = parseISO(dateValue);
		} else if (typeof dateValue === "number") {
			// Unix timestamp
			parsedDate = new Date(dateValue);
		} else {
			// Fallback for any other format
			console.warn(
				"Unexpected date format in storage:",
				dateValue,
				typeof dateValue,
			);
			parsedDate = new Date();
		}

		// Validate the parsed date
		if (!isValid(parsedDate)) {
			console.warn(
				"Invalid lastAnalyzedDate in stored memory, using epoch:",
				dateValue,
			);
			parsedDate = new Date(0);
		}

		stored.lastAnalyzedDate = parsedDate;

		// Handle lastHistoryTimestamp field (new in v1.0.3)
		if (typeof stored.lastHistoryTimestamp !== "number") {
			stored.lastHistoryTimestamp = 0;
		}

		// Handle UserProfile fields (v1.5.0 nested structure)
		if (!stored.userProfile.stableTraits) {
			stored.userProfile.stableTraits = {
				coreIdentities: stored.userProfile.coreIdentities || [],
				personalPreferences: stored.userProfile.personalPreferences || [],
			};
		}
		if (!stored.userProfile.dynamicContext) {
			stored.userProfile.dynamicContext = {
				currentTasks: stored.userProfile.currentTasks || [],
				currentInterests: stored.userProfile.currentInterests || [],
			};
		}
		// Clean up old flat fields if they exist
		delete stored.userProfile.coreIdentities;
		delete stored.userProfile.personalPreferences;
		delete stored.userProfile.currentTasks;
		delete stored.userProfile.currentInterests;

		// Check version compatibility
		if (stored.version !== MEMORY_VERSION) {
			console.log(
				`Memory version mismatch (${stored.version} !== ${MEMORY_VERSION}), creating new memory`,
			);
			return null;
		}

		console.log("Loaded memory from chrome.storage.local:", {
			patterns: stored.patterns.length,
			lastAnalyzed: stored.lastAnalyzedDate,
			lastAnalyzedType: typeof stored.lastAnalyzedDate,
			lastAnalyzedIsDate: stored.lastAnalyzedDate instanceof Date,
			lastHistoryTimestamp: stored.lastHistoryTimestamp,
		});
		return stored;
	} catch (error) {
		console.error("Failed to load memory:", error);
		return null;
	}
}

/**
 * Save memory via service worker message passing (for offscreen documents)
 */
export async function saveMemoryToServiceWorker(
	memory: AnalysisMemory,
): Promise<void> {
	try {
		await trpc.memory.write.mutate({ memory });
	} catch (error) {
		console.error("[Memory] Failed to save memory via service worker:", error);
	}
}

/**
 * Save memory to Chrome storage
 */
export async function saveMemoryToStorage(
	memory: AnalysisMemory,
): Promise<void> {
	try {
		// Check if we're in an environment with chrome.storage access
		if (
			typeof chrome === "undefined" ||
			!chrome.storage ||
			!chrome.storage.local
		) {
			console.log(
				"Chrome storage API not available for saving memory, skipping",
			);
			return;
		}

		// Ensure lastAnalyzedDate is properly formatted
		// This handles Date objects, ISO strings, timestamps, or any valid date format
		let lastAnalyzedDate =
			memory.lastAnalyzedDate instanceof Date
				? memory.lastAnalyzedDate
				: typeof memory.lastAnalyzedDate === "string"
					? parseISO(memory.lastAnalyzedDate)
					: new Date(memory.lastAnalyzedDate);

		// Validate the date
		if (!isValid(lastAnalyzedDate)) {
			console.warn(
				"[Memory] Invalid lastAnalyzedDate, using current date:",
				memory.lastAnalyzedDate,
			);
			lastAnalyzedDate = new Date();
		}

		// Normalize the date to an ISO string before saving to prevent serialization issues
		const memoryToSave = {
			...memory,
			lastAnalyzedDate: format(
				lastAnalyzedDate,
				"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
			),
			lastHistoryTimestamp: memory.lastHistoryTimestamp,
		};

		await chrome.storage.local.set({ [MEMORY_KEY]: memoryToSave });
		console.log("[Memory] Saved to chrome.storage.local:", {
			key: MEMORY_KEY,
			patterns: memory.patterns.length,
			lastAnalyzedDate: lastAnalyzedDate,
			lastAnalyzedDateISO: memoryToSave.lastAnalyzedDate,
			lastHistoryTimestamp: memory.lastHistoryTimestamp,
			userProfile: {
				coreIdentities:
					memory.userProfile?.stableTraits?.coreIdentities?.length || 0,
				currentTasks:
					memory.userProfile?.dynamicContext?.currentTasks?.length || 0,
				summary: memory.userProfile?.summary || "No summary",
			},
		});
	} catch (error) {
		console.error("Failed to save memory:", error);
	}
}

/**
 * Clear memory from Chrome storage
 */
export async function clearMemoryFromStorage(): Promise<void> {
	// Check if we're in an environment with chrome.storage access
	if (
		typeof chrome === "undefined" ||
		!chrome.storage ||
		!chrome.storage.local
	) {
		console.log(
			"Chrome storage API not available for clearing memory, skipping",
		);
		return;
	}

	await chrome.storage.local.remove(MEMORY_KEY);
	console.log("Analysis memory cleared from chrome.storage.local");
}
