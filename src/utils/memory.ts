import type { UserProfile, WorkflowPattern } from "../types";

// Memory structure for accumulated analysis
export interface AnalysisMemory {
	userProfile: UserProfile;
	patterns: WorkflowPattern[];
	lastAnalyzedDate: Date;
	lastHistoryTimestamp: number; // Timestamp of the most recent history item analyzed
	version: string;
}

// Chunk of history for processing
export interface HistoryChunk {
	startTime: Date;
	endTime: Date;
	items: chrome.history.HistoryItem[];
	chunkIndex: number;
	totalChunks: number;
	isFallback?: boolean;
}

// Time range for a chunk
export interface ChunkTimeRange {
	startTime: number; // timestamp
	endTime: number; // timestamp
	description: string; // e.g., "Morning work session", "Evening browsing"
}

const MEMORY_KEY = "history_analysis_memory";
const MEMORY_VERSION = "1.1.0"; // Added new UserProfile fields: currentGoals, recentObsessions, lifecycleHints, personalPreferences

// Initialize empty memory
export function createEmptyMemory(): AnalysisMemory {
	return {
		userProfile: {
			profession: "Unknown",
			interests: [],
			currentGoals: [],
			recentObsessions: [],
			lifecycleHints: [],
			personalPreferences: [],
			workPatterns: [],
			personalityTraits: [],
			technologyUse: [],
			summary: "No profile data yet.",
		},
		patterns: [],
		lastAnalyzedDate: new Date(0), // Start from epoch
		lastHistoryTimestamp: 0, // No history analyzed yet
		version: MEMORY_VERSION,
	};
}

// Load memory from Chrome storage
export async function loadMemory(): Promise<AnalysisMemory | null> {
	try {
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

		// Handle different possible date formats
		let parsedDate: Date;
		if (dateValue instanceof Date) {
			// Already a Date object
			parsedDate = dateValue;
		} else if (typeof dateValue === "string") {
			// ISO string from JSON serialization
			parsedDate = new Date(dateValue);
		} else if (typeof dateValue === "number") {
			// Unix timestamp
			parsedDate = new Date(dateValue);
		} else if (typeof dateValue === "object" && dateValue !== null) {
			// Date object that lost its prototype during JSON serialization/deserialization
			console.warn(
				"Date stored as plain object, attempting to recover:",
				dateValue,
			);
			try {
				// Try to convert the object to a string and parse it
				const dateString = String(dateValue);
				parsedDate = new Date(dateString);

				// If that didn't work, it might be a Date object that lost its prototype
				if (Number.isNaN(parsedDate.getTime())) {
					// Force create a new Date from current time as fallback
					console.warn(
						"Could not recover date from object, using current time",
					);
					parsedDate = new Date();
				}
			} catch (error) {
				console.warn("Error parsing date object:", error);
				parsedDate = new Date();
			}
		} else {
			// Invalid format
			console.warn(
				"Unexpected date format in storage:",
				dateValue,
				typeof dateValue,
			);
			parsedDate = new Date();
		}

		stored.lastAnalyzedDate = parsedDate;

		// Handle lastHistoryTimestamp field (new in v1.0.3)
		if (typeof stored.lastHistoryTimestamp !== "number") {
			stored.lastHistoryTimestamp = 0;
		}

		// Handle new UserProfile fields (new in v1.1.0)
		if (!stored.userProfile.currentGoals) {
			stored.userProfile.currentGoals = [];
		}
		if (!stored.userProfile.recentObsessions) {
			stored.userProfile.recentObsessions = [];
		}
		if (!stored.userProfile.lifecycleHints) {
			stored.userProfile.lifecycleHints = [];
		}
		if (!stored.userProfile.personalPreferences) {
			stored.userProfile.personalPreferences = [];
		}

		// Validate the date conversion
		if (Number.isNaN(stored.lastAnalyzedDate.getTime())) {
			console.warn(
				"Invalid lastAnalyzedDate in stored memory, using epoch. Original value:",
				dateValue,
			);
			stored.lastAnalyzedDate = new Date(0);
		}

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

// Save memory to Chrome storage
export async function saveMemory(memory: AnalysisMemory): Promise<void> {
	try {
		// Normalize the date to an ISO string before saving to prevent serialization issues
		const memoryToSave = {
			...memory,
			lastAnalyzedDate: memory.lastAnalyzedDate.toISOString(),
			lastHistoryTimestamp: memory.lastHistoryTimestamp,
		};

		await chrome.storage.local.set({ [MEMORY_KEY]: memoryToSave });
		console.log("Saved memory to chrome.storage.local:", {
			patterns: memory.patterns.length,
			lastAnalyzedDate: memory.lastAnalyzedDate,
			lastAnalyzedDateISO: memoryToSave.lastAnalyzedDate,
			lastHistoryTimestamp: memory.lastHistoryTimestamp,
		});
	} catch (error) {
		console.error("Failed to save memory:", error);
	}
}

// Clear memory
export async function clearMemory(): Promise<void> {
	await chrome.storage.local.remove(MEMORY_KEY);
	console.log("Analysis memory cleared from chrome.storage.local");
}
