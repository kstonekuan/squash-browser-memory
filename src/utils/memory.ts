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

// Load memory from local storage
export async function loadMemory(): Promise<AnalysisMemory | null> {
	try {
		const stored = localStorage.getItem(MEMORY_KEY);
		if (!stored) return null;

		const memory = JSON.parse(stored);
		// Convert date strings back to Date objects
		memory.lastAnalyzedDate = new Date(memory.lastAnalyzedDate);

		// Check version compatibility
		if (memory.version !== MEMORY_VERSION) {
			// Memory version mismatch, creating new memory
			return null;
		}

		return memory;
	} catch (_error) {
		// Failed to load memory
		return null;
	}
}

// Save memory to local storage
export async function saveMemory(memory: AnalysisMemory): Promise<void> {
	try {
		localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
	} catch (_error) {
		// Failed to save memory
	}
}

// Clear memory
export async function clearMemory(): Promise<void> {
	localStorage.removeItem(MEMORY_KEY);
}

// Simply update memory with new results (AI handles the merging)
export function mergeMemoryWithResults(
	memory: AnalysisMemory,
	newProfile: UserProfile,
	newPatterns: WorkflowPattern[],
	itemsAnalyzed: number,
): AnalysisMemory {
	// The AI has already merged old memory with new chunk data
	// So we just take the new results as-is
	return {
		userProfile: newProfile,
		patterns: newPatterns,
		lastAnalyzedDate: new Date(),
		totalItemsAnalyzed: memory.totalItemsAnalyzed + itemsAnalyzed,
		version: MEMORY_VERSION,
	};
}
