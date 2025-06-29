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

// Merge new analysis results with existing memory
export function mergeMemoryWithResults(
	memory: AnalysisMemory,
	newProfile: UserProfile,
	newPatterns: WorkflowPattern[],
	itemsAnalyzed: number,
): AnalysisMemory {
	// Merge user profile - bias towards new information
	const mergedProfile: UserProfile = {
		// Take the new profession if it's more specific than "Unknown"
		profession:
			newProfile.profession !== "Unknown"
				? newProfile.profession
				: memory.userProfile.profession,

		// Merge interests, keeping unique ones
		interests: [
			...new Set([...memory.userProfile.interests, ...newProfile.interests]),
		],

		// Merge work patterns, preferring newer insights
		workPatterns: mergeWorkPatterns(
			memory.userProfile.workPatterns,
			newProfile.workPatterns,
		),

		// Merge personality traits, updating evidence
		personalityTraits: mergePersonalityTraits(
			memory.userProfile.personalityTraits,
			newProfile.personalityTraits,
		),

		// Update technology use with latest proficiency
		technologyUse: mergeTechnologyUse(
			memory.userProfile.technologyUse,
			newProfile.technologyUse,
		),

		// Use the new summary if it's more comprehensive
		summary:
			newProfile.summary.length > memory.userProfile.summary.length
				? newProfile.summary
				: memory.userProfile.summary,
	};

	// Merge patterns - combine and deduplicate
	const mergedPatterns = mergePatterns(memory.patterns, newPatterns);

	return {
		userProfile: mergedProfile,
		patterns: mergedPatterns,
		lastAnalyzedDate: new Date(),
		totalItemsAnalyzed: memory.totalItemsAnalyzed + itemsAnalyzed,
		version: MEMORY_VERSION,
	};
}

function mergeWorkPatterns(
	existing: UserProfile["workPatterns"],
	newPatterns: UserProfile["workPatterns"],
): UserProfile["workPatterns"] {
	const patternMap = new Map<string, UserProfile["workPatterns"][0]>();

	// Add existing patterns
	existing.forEach((pattern) => {
		patternMap.set(pattern.type, pattern);
	});

	// Update with new patterns (bias towards new)
	newPatterns.forEach((pattern) => {
		patternMap.set(pattern.type, pattern);
	});

	return Array.from(patternMap.values());
}

function mergePersonalityTraits(
	existing: UserProfile["personalityTraits"],
	newTraits: UserProfile["personalityTraits"],
): UserProfile["personalityTraits"] {
	const traitMap = new Map<string, UserProfile["personalityTraits"][0]>();

	// Add existing traits
	existing.forEach((trait) => {
		traitMap.set(trait.trait, trait);
	});

	// Update with new traits or enhance evidence
	newTraits.forEach((trait) => {
		const existing = traitMap.get(trait.trait);
		if (existing) {
			// Combine evidence if trait already exists
			traitMap.set(trait.trait, {
				trait: trait.trait,
				evidence: `${existing.evidence} Additionally: ${trait.evidence}`,
			});
		} else {
			traitMap.set(trait.trait, trait);
		}
	});

	return Array.from(traitMap.values());
}

function mergeTechnologyUse(
	existing: UserProfile["technologyUse"],
	newTech: UserProfile["technologyUse"],
): UserProfile["technologyUse"] {
	const techMap = new Map<string, UserProfile["technologyUse"][0]>();

	// Add existing technology use
	existing.forEach((tech) => {
		techMap.set(tech.category, tech);
	});

	// Update with new technology use (bias towards higher proficiency)
	newTech.forEach((tech) => {
		const existing = techMap.get(tech.category);
		if (existing) {
			// Keep the higher proficiency level
			const levels = ["beginner", "intermediate", "advanced", "expert"];
			const existingLevel = levels.indexOf(existing.level);
			const newLevel = levels.indexOf(tech.level);
			techMap.set(tech.category, {
				category: tech.category,
				level: newLevel >= existingLevel ? tech.level : existing.level,
				tools: [...new Set([...existing.tools, ...tech.tools])],
			});
		} else {
			techMap.set(tech.category, tech);
		}
	});

	return Array.from(techMap.values());
}

function mergePatterns(
	existing: WorkflowPattern[],
	newPatterns: WorkflowPattern[],
): WorkflowPattern[] {
	const patternMap = new Map<string, WorkflowPattern>();

	// Add existing patterns
	existing.forEach((pattern) => {
		patternMap.set(pattern.pattern, pattern);
	});

	// Merge with new patterns
	newPatterns.forEach((pattern) => {
		const existing = patternMap.get(pattern.pattern);
		if (existing) {
			// Update existing pattern with higher frequency and merged URLs
			patternMap.set(pattern.pattern, {
				...pattern,
				frequency: existing.frequency + pattern.frequency,
				urls: [...new Set([...existing.urls, ...pattern.urls])].slice(0, 10), // Keep top 10 URLs
			});
		} else {
			patternMap.set(pattern.pattern, pattern);
		}
	});

	// Sort by frequency and return top patterns
	return Array.from(patternMap.values())
		.sort((a, b) => b.frequency - a.frequency)
		.slice(0, 20); // Keep top 20 patterns
}
