// @ts-ignore: Package has no types
import { compareTwoStrings } from "string-similarity";
import {
	type AnalysisMemoryWithEmbeddings,
	type ContextEmbedding,
	loadMemoryWithEmbeddings,
} from "./embeddings-memory";

export interface ContextSuggestion {
	text: string;
	category: ContextEmbedding["category"];
	relevanceScore: number;
	matchType: "semantic" | "string";
}

export interface SemanticMatcherOptions {
	maxSuggestions?: number;
	semanticThreshold?: number;
	stringThreshold?: number;
	debounceMs?: number;
}

export class SemanticMatcher {
	private memory: AnalysisMemoryWithEmbeddings | null = null;
	private extractor:
		| ((
				texts: string[],
				options: { pooling: string; normalize: boolean },
		  ) => Promise<{ data: Float32Array }[]>)
		| null = null;
	private modelLoaded = false;
	private modelLoading = false;
	private recentCache = new Map<string, ContextSuggestion[]>();
	private debounceTimeout: number | null = null;

	constructor(private options: SemanticMatcherOptions = {}) {
		this.options = {
			maxSuggestions: 5,
			semanticThreshold: 0.4,
			stringThreshold: 0.3,
			debounceMs: 300,
			...options,
		};
	}

	// Initialize the semantic matcher by loading memory and model
	async initialize(): Promise<void> {
		try {
			// Load memory with embeddings
			this.memory = await loadMemoryWithEmbeddings();
			if (!this.memory) {
				console.log("No memory found for semantic matching");
				return;
			}

			console.log(
				`Loaded memory with ${Object.keys(this.memory.contextEmbeddings || {}).length} context embeddings`,
			);

			// Start loading the model in the background
			this.loadModel();
		} catch (error) {
			console.error("Failed to initialize semantic matcher:", error);
		}
	}

	// Load the embedding model
	private async loadModel(): Promise<void> {
		if (this.modelLoaded || this.modelLoading) return;

		this.modelLoading = true;
		try {
			// @ts-ignore: Dynamic import
			const { pipeline } = await import("@xenova/transformers");
			// @ts-ignore: Transformers.js types
			this.extractor = await pipeline("feature-extraction", "Xenova/gte-small");
			this.modelLoaded = true;
			console.log("Semantic embedding model loaded successfully");
		} catch (error) {
			console.error("Failed to load semantic model:", error);
			this.modelLoaded = false;
		} finally {
			this.modelLoading = false;
		}
	}

	// Main function to get context suggestions for user input
	async getSuggestions(input: string): Promise<ContextSuggestion[]> {
		if (!input || input.trim().length < 3) {
			return [];
		}

		const trimmedInput = input.trim().toLowerCase();

		// Check cache first
		if (this.recentCache.has(trimmedInput)) {
			return this.recentCache.get(trimmedInput)!;
		}

		// Ensure memory is loaded
		if (!this.memory) {
			await this.initialize();
			if (!this.memory) return [];
		}

		let suggestions: ContextSuggestion[] = [];

		// Try semantic matching first (if model is loaded)
		if (this.modelLoaded && this.memory.contextEmbeddings) {
			try {
				suggestions = await this.getSemanticSuggestions(trimmedInput);
			} catch (error) {
				console.error("Semantic matching failed:", error);
			}
		}

		// Fallback to string similarity if semantic matching failed or returned few results
		if (suggestions.length < 3) {
			const stringSuggestions = this.getStringSuggestions(trimmedInput);

			// Merge and deduplicate suggestions
			const existingTexts = new Set(suggestions.map((s) => s.text));
			for (const suggestion of stringSuggestions) {
				if (!existingTexts.has(suggestion.text)) {
					suggestions.push(suggestion);
				}
			}
		}

		// Sort by relevance score and limit results
		suggestions.sort((a, b) => b.relevanceScore - a.relevanceScore);
		suggestions = suggestions.slice(0, this.options.maxSuggestions);

		// Cache the results
		this.recentCache.set(trimmedInput, suggestions);

		// Limit cache size
		if (this.recentCache.size > 50) {
			const oldestKey = this.recentCache.keys().next().value;
			if (oldestKey !== undefined) {
				this.recentCache.delete(oldestKey);
			}
		}

		return suggestions;
	}

	// Get suggestions using semantic similarity (cosine similarity of embeddings)
	private async getSemanticSuggestions(
		input: string,
	): Promise<ContextSuggestion[]> {
		if (!this.memory?.contextEmbeddings || !this.extractor) {
			return [];
		}

		// Generate embedding for input text
		const inputEmbedding = await this.extractor([input], {
			pooling: "mean",
			normalize: true,
		});
		const inputVector = new Float32Array(inputEmbedding[0].data);

		const suggestions: ContextSuggestion[] = [];

		// Compare with all stored context embeddings
		for (const [_contextId, context] of Object.entries(
			this.memory.contextEmbeddings,
		)) {
			const similarity = this.cosineSimilarity(inputVector, context.embedding);

			if (similarity >= this.options.semanticThreshold!) {
				suggestions.push({
					text: context.text,
					category: context.category,
					relevanceScore: similarity,
					matchType: "semantic",
				});
			}
		}

		return suggestions;
	}

	// Get suggestions using string similarity (fallback method)
	private getStringSuggestions(input: string): ContextSuggestion[] {
		if (!this.memory?.contextEmbeddings) {
			return [];
		}

		const suggestions: ContextSuggestion[] = [];

		// Compare with all stored context text
		for (const [_contextId, context] of Object.entries(
			this.memory.contextEmbeddings,
		)) {
			const similarity = compareTwoStrings(input, context.text.toLowerCase());

			if (similarity >= this.options.stringThreshold!) {
				suggestions.push({
					text: context.text,
					category: context.category,
					relevanceScore: similarity,
					matchType: "string",
				});
			}
		}

		return suggestions;
	}

	// Calculate cosine similarity between two vectors
	private cosineSimilarity(a: Float32Array, b: Float32Array): number {
		if (a.length !== b.length) {
			throw new Error("Vector dimensions must match");
		}

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}

		normA = Math.sqrt(normA);
		normB = Math.sqrt(normB);

		if (normA === 0 || normB === 0) {
			return 0;
		}

		return dotProduct / (normA * normB);
	}

	// Debounced version of getSuggestions for real-time input
	async getSuggestionsDebounced(input: string): Promise<ContextSuggestion[]> {
		return new Promise((resolve) => {
			if (this.debounceTimeout) {
				clearTimeout(this.debounceTimeout);
			}

			this.debounceTimeout = window.setTimeout(async () => {
				const suggestions = await this.getSuggestions(input);
				resolve(suggestions);
			}, this.options.debounceMs);
		});
	}

	// Check if semantic matching is available
	isSemanticAvailable(): boolean {
		return this.modelLoaded;
	}

	// Get model loading status
	isModelLoading(): boolean {
		return this.modelLoading;
	}

	// Refresh memory (call when memory is updated)
	async refreshMemory(): Promise<void> {
		this.memory = await loadMemoryWithEmbeddings();
		this.recentCache.clear();
		console.log("Semantic matcher memory refreshed");
	}

	// Clear cache
	clearCache(): void {
		this.recentCache.clear();
	}
}

// Singleton instance for global use
let globalMatcher: SemanticMatcher | null = null;

export function getSemanticMatcher(
	options?: SemanticMatcherOptions,
): SemanticMatcher {
	if (!globalMatcher) {
		globalMatcher = new SemanticMatcher(options);
	}
	return globalMatcher;
}

// Utility function for quick suggestions
export async function getContextSuggestions(
	input: string,
	options?: SemanticMatcherOptions,
): Promise<ContextSuggestion[]> {
	const matcher = getSemanticMatcher(options);
	if (!matcher.isSemanticAvailable() && !matcher.isModelLoading()) {
		await matcher.initialize();
	}
	return matcher.getSuggestionsDebounced(input);
}
