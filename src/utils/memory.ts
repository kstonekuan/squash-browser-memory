import type { UserProfile, WorkflowPattern } from "../types";

// Memory structure for accumulated analysis
export interface AnalysisMemory {
	userProfile: UserProfile;
	patterns: WorkflowPattern[];
	lastAnalyzedDate: Date;
	totalItemsAnalyzed: number;
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
const MEMORY_VERSION = "1.0.0";

// Initialize empty memory
export function createEmptyMemory(): AnalysisMemory {
	return {
		userProfile: {
			profession: "Unknown",
			interests: [],
			workPatterns: [],
			personalityTraits: [],
			technologyUse: [],
			summary: "No profile data yet.",
		},
		patterns: [],
		lastAnalyzedDate: new Date(0), // Start from epoch
		totalItemsAnalyzed: 0,
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
		stored.lastAnalyzedDate = new Date(dateValue);

		// Validate the date conversion
		if (isNaN(stored.lastAnalyzedDate.getTime())) {
			console.warn("Invalid lastAnalyzedDate in stored memory, using epoch");
			stored.lastAnalyzedDate = new Date(0);
		}

		// Check version compatibility
		if (stored.version !== MEMORY_VERSION) {
			console.log("Memory version mismatch, creating new memory");
			return null;
		}

		console.log("Loaded memory from chrome.storage.local:", {
			itemsAnalyzed: stored.totalItemsAnalyzed,
			patterns: stored.patterns.length,
			lastAnalyzed: stored.lastAnalyzedDate,
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
		await chrome.storage.local.set({ [MEMORY_KEY]: memory });
		console.log("Saved memory to chrome.storage.local:", {
			itemsAnalyzed: memory.totalItemsAnalyzed,
			patterns: memory.patterns.length,
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
