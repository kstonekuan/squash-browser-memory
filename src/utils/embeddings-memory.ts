import type { AnalysisMemory } from "./memory";
import { loadMemory, saveMemory } from "./memory";

// Extended memory structure with embeddings
export interface ContextEmbedding {
	text: string;
	embedding: Float32Array; // 384 dimensions for gte-small
	category:
		| "goals"
		| "profession"
		| "patterns"
		| "preferences"
		| "traits"
		| "interests"
		| "obsessions";
	lastUpdated: Date;
}

export interface AnalysisMemoryWithEmbeddings extends AnalysisMemory {
	contextEmbeddings?: {
		[contextId: string]: ContextEmbedding;
	};
	embeddingModelVersion?: string;
}

// Enhanced saveMemory function that computes embeddings
export async function saveMemoryWithEmbeddings(
	memory: AnalysisMemory,
): Promise<void> {
	const memoryWithEmbeddings = await computeContextEmbeddings(memory);
	await saveMemory(memoryWithEmbeddings);
}

// Load memory with embeddings support
export async function loadMemoryWithEmbeddings(): Promise<AnalysisMemoryWithEmbeddings | null> {
	const memory = await loadMemory();
	if (!memory) return null;

	// If no embeddings exist, compute them
	if (!(memory as AnalysisMemoryWithEmbeddings).contextEmbeddings) {
		return await computeContextEmbeddings(memory);
	}

	return memory as AnalysisMemoryWithEmbeddings;
}

// Extract all context text from UserProfile and WorkflowPatterns
function extractContexts(
	memory: AnalysisMemory,
): Array<{ text: string; category: ContextEmbedding["category"] }> {
	const contexts: Array<{
		text: string;
		category: ContextEmbedding["category"];
	}> = [];
	const { userProfile, patterns } = memory;

	// Current Goals
	userProfile.currentGoals.forEach((goal) => {
		if (goal && goal.trim().length > 0) {
			contexts.push({ text: goal, category: "goals" });
		}
	});

	// Recent Obsessions
	userProfile.recentObsessions.forEach((obsession) => {
		if (obsession && obsession.trim().length > 0) {
			contexts.push({ text: obsession, category: "obsessions" });
		}
	});

	// Profession
	if (userProfile.profession && userProfile.profession !== "Unknown") {
		contexts.push({ text: userProfile.profession, category: "profession" });
	}

	// Personal Preferences
	userProfile.personalPreferences.forEach((pref) => {
		if (pref.preference && pref.preference.trim().length > 0) {
			const text = pref.category
				? `${pref.category}: ${pref.preference}`
				: pref.preference;
			contexts.push({ text, category: "preferences" });
		}
	});

	// Personality Traits
	userProfile.personalityTraits.forEach((trait) => {
		if (trait.trait && trait.trait.trim().length > 0) {
			const text = trait.evidence
				? `${trait.trait} - ${trait.evidence}`
				: trait.trait;
			contexts.push({ text, category: "traits" });
		}
	});

	// Interests
	userProfile.interests.forEach((interest) => {
		if (interest && interest.trim().length > 0) {
			contexts.push({ text: interest, category: "interests" });
		}
	});

	// Lifecycle Hints
	userProfile.lifecycleHints.forEach((hint) => {
		if (hint && hint.trim().length > 0) {
			contexts.push({ text: hint, category: "traits" });
		}
	});

	// Work Patterns
	userProfile.workPatterns.forEach((pattern) => {
		if (pattern.description && pattern.description.trim().length > 0) {
			const text = pattern.type
				? `${pattern.type}: ${pattern.description}`
				: pattern.description;
			contexts.push({ text, category: "patterns" });
		}
	});

	// Technology Use
	userProfile.technologyUse.forEach((tech) => {
		if (tech.tools && tech.tools.length > 0) {
			const text = `${tech.category} (${tech.level}): ${tech.tools.join(", ")}`;
			contexts.push({ text, category: "preferences" });
		}
	});

	// Workflow Patterns
	patterns.forEach((pattern) => {
		if (pattern.description && pattern.description.trim().length > 0) {
			const text = `${pattern.pattern}: ${pattern.description}`;
			contexts.push({ text, category: "patterns" });
		}
	});

	// User Profile Summary (if meaningful)
	if (
		userProfile.summary &&
		userProfile.summary !== "No profile data yet." &&
		userProfile.summary.trim().length > 20
	) {
		contexts.push({ text: userProfile.summary, category: "traits" });
	}

	return contexts;
}

// Compute embeddings for all context snippets
async function computeContextEmbeddings(
	memory: AnalysisMemory,
): Promise<AnalysisMemoryWithEmbeddings> {
	try {
		// Dynamic import to avoid loading the model until needed
		// @ts-ignore: Dynamic import
		const { pipeline } = await import("@xenova/transformers");

		// Create feature extraction pipeline with gte-small model
		const extractor = await pipeline("feature-extraction", "Xenova/gte-small");

		const contexts = extractContexts(memory);
		const embeddings: { [contextId: string]: ContextEmbedding } = {};

		if (contexts.length === 0) {
			console.log("No contexts found for embedding computation");
			return {
				...memory,
				contextEmbeddings: embeddings,
				embeddingModelVersion: "Xenova/gte-small",
			};
		}

		console.log(`Computing embeddings for ${contexts.length} context snippets`);

		// Batch process for efficiency
		const texts = contexts.map((ctx) => ctx.text);
		const batchEmbeddings = await extractor(texts, {
			pooling: "mean",
			normalize: true,
		});

		// Store with unique IDs
		contexts.forEach((context, index) => {
			const contextId = `${context.category}_${hashString(context.text)}`;
			embeddings[contextId] = {
				text: context.text,
				embedding: new Float32Array(batchEmbeddings[index].data), // Ensure Float32Array
				category: context.category,
				lastUpdated: new Date(),
			};
		});

		console.log(
			`Successfully computed ${Object.keys(embeddings).length} embeddings`,
		);

		return {
			...memory,
			contextEmbeddings: embeddings,
			embeddingModelVersion: "Xenova/gte-small",
		};
	} catch (error) {
		console.error("Failed to compute embeddings:", error);
		// Return memory without embeddings if computation fails
		return {
			...memory,
			contextEmbeddings: {},
			embeddingModelVersion: "failed",
		};
	}
}

// Simple hash function for context IDs
function hashString(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	return Math.abs(hash).toString(36);
}

// Check if embeddings need to be recomputed (e.g., model version changed)
export function needsEmbeddingUpdate(
	memory: AnalysisMemoryWithEmbeddings,
): boolean {
	if (!memory.contextEmbeddings || !memory.embeddingModelVersion) {
		return true;
	}

	if (memory.embeddingModelVersion !== "Xenova/gte-small") {
		return true;
	}

	// Check if there are new contexts that don't have embeddings
	const currentContexts = extractContexts(memory);
	const existingContextIds = new Set(Object.keys(memory.contextEmbeddings));

	return currentContexts.some((context) => {
		const contextId = `${context.category}_${hashString(context.text)}`;
		return !existingContextIds.has(contextId);
	});
}
