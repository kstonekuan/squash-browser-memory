import type { WorkflowPattern } from "../types";
import type { AnalysisMemory } from "./memory";
import { loadMemory } from "./memory";

export interface ContextSuggestion {
	text: string;
	category: string;
	relevanceScore: number;
	matchType: "semantic" | "string";
	workflowPattern?: WorkflowPattern; // Store full workflow pattern data when applicable
}

// Simple string similarity using Dice's coefficient (bigram similarity)
function calculateSimilarity(str1: string, str2: string): number {
	if (str1 === str2) return 1;
	if (str1.length === 0 || str2.length === 0) return 0;

	const a = str1.toLowerCase();
	const b = str2.toLowerCase();

	// Get bigrams
	const bigrams1: string[] = [];
	const bigrams2: string[] = [];

	for (let i = 0; i < a.length - 1; i++) {
		bigrams1.push(a.substring(i, i + 2));
	}

	for (let i = 0; i < b.length - 1; i++) {
		bigrams2.push(b.substring(i, i + 2));
	}

	// Calculate intersection
	let intersection = 0;
	const union = bigrams1.length + bigrams2.length;

	for (const bigram of bigrams1) {
		const index = bigrams2.indexOf(bigram);
		if (index >= 0) {
			intersection++;
			bigrams2.splice(index, 1);
		}
	}

	return (2.0 * intersection) / union;
}

export class SimpleContextMatcher {
	private memory: AnalysisMemory | null = null;
	private preGeneratedContexts: Array<{
		text: string;
		category: string;
		workflowPattern?: WorkflowPattern;
	}> = [];

	async initialize(): Promise<void> {
		try {
			this.memory = await loadMemory();
			console.log("Memory loaded:", {
				hasMemory: !!this.memory,
				hasUserProfile: !!this.memory?.userProfile,
				hasPatterns: !!this.memory?.patterns,
				patternsCount: this.memory?.patterns?.length || 0,
				patterns: this.memory?.patterns,
			});

			// Pre-generate contexts on initialization
			this.preGeneratedContexts = this.extractContextsFromMemory();
			console.log("Context suggestions pre-generated on content script load:", {
				totalContexts: this.preGeneratedContexts.length,
				workflowPatterns: this.preGeneratedContexts.filter(
					(c) => c.category === "workflow",
				).length,
				contexts: this.preGeneratedContexts,
			});
		} catch (error) {
			console.error("Failed to initialize context matcher:", error);
		}
	}

	async getSuggestions(
		input: string,
		maxSuggestions = 5,
	): Promise<ContextSuggestion[]> {
		if (!input || input.trim().length < 3) return [];

		// Add some sample data if no memory exists (for testing)
		if (!this.memory?.userProfile) {
			const sampleContexts = [
				{
					text: "Software engineer passionate about AI and web development",
					category: "profession",
				},
				{
					text: "Building Chrome extensions and browser automation tools",
					category: "interests",
				},
				{
					text: "Learning about React, TypeScript, and machine learning",
					category: "goals",
				},
				{
					text: "Enjoys clean code, good UX design, and efficient workflows",
					category: "preferences",
				},
				{
					text: "Problem-solver who likes optimizing developer experience",
					category: "traits",
				},
				{
					text: "Currently exploring LLM integration and semantic search",
					category: "obsessions",
				},
			];

			return this.matchSampleContexts(input, sampleContexts, maxSuggestions);
		}

		const suggestions: ContextSuggestion[] = [];
		const inputLower = input.toLowerCase();

		// Use pre-generated contexts instead of extracting each time
		const contexts = this.preGeneratedContexts;

		// Calculate similarity for each context
		for (const context of contexts) {
			const similarity = calculateSimilarity(
				inputLower,
				context.text.toLowerCase(),
			);
			if (similarity > 0.2) {
				// Threshold for relevance
				suggestions.push({
					text: context.text,
					category: context.category,
					relevanceScore: similarity,
					matchType: "string",
					workflowPattern: context.workflowPattern,
				});
			}
		}

		// Sort by relevance and return top suggestions
		return suggestions
			.sort((a, b) => b.relevanceScore - a.relevanceScore)
			.slice(0, maxSuggestions);
	}

	private matchSampleContexts(
		input: string,
		sampleContexts: Array<{ text: string; category: string }>,
		maxSuggestions: number,
	): ContextSuggestion[] {
		const inputLower = input.toLowerCase();
		const suggestions: ContextSuggestion[] = [];

		for (const context of sampleContexts) {
			const similarity = calculateSimilarity(
				inputLower,
				context.text.toLowerCase(),
			);
			if (similarity > 0.2) {
				suggestions.push({
					text: context.text,
					category: context.category,
					relevanceScore: similarity,
					matchType: "string",
				});
			}
		}

		return suggestions
			.sort((a, b) => b.relevanceScore - a.relevanceScore)
			.slice(0, maxSuggestions);
	}

	private extractContextsFromMemory(): Array<{
		text: string;
		category: string;
		workflowPattern?: WorkflowPattern;
	}> {
		if (!this.memory?.userProfile) return [];

		const contexts: Array<{
			text: string;
			category: string;
			workflowPattern?: WorkflowPattern;
		}> = [];
		const profile = this.memory.userProfile;

		// Helper function to safely add context
		const addContext = (
			value: unknown,
			category: string,
			workflowPattern?: WorkflowPattern,
		) => {
			if (value && typeof value === "string" && value.trim()) {
				contexts.push({ text: value.trim(), category, workflowPattern });
			}
		};

		// Helper function to safely add array items (for string arrays)
		const addArrayItems = (array: unknown, category: string) => {
			if (Array.isArray(array)) {
				for (const item of array) {
					addContext(item, category);
				}
			}
		};

		// Helper function to add object arrays with specific property extraction
		const addObjectArray = (
			array: unknown,
			category: string,
			textExtractor: (item: unknown) => string,
		) => {
			if (Array.isArray(array)) {
				for (const item of array) {
					if (item && typeof item === "object") {
						const text = textExtractor(item);
						addContext(text, category);
					}
				}
			}
		};

		// Add core identities (string array)
		addArrayItems(profile.stableTraits?.coreIdentities, "identities");

		// Add current tasks (string array)
		addArrayItems(profile.dynamicContext?.currentTasks, "tasks");

		// Add current interests (string array)
		addArrayItems(profile.dynamicContext?.currentInterests, "interests");

		// Add personal preferences (object array: {category, preference})
		addObjectArray(
			profile.stableTraits?.personalPreferences,
			"preferences",
			(item) => {
				const obj = item as { category?: string; preference?: string };
				return `${obj.category || ""}: ${obj.preference || ""}`;
			},
		);

		// Add summary as a single context item
		addContext(profile.summary, "summary");

		// Add workflow patterns - use description for lookup, store full pattern for insertion
		if (this.memory.patterns && Array.isArray(this.memory.patterns)) {
			console.log("Processing workflow patterns:", this.memory.patterns.length);
			for (const pattern of this.memory.patterns) {
				if (pattern && typeof pattern === "object" && pattern.description) {
					addContext(pattern.description, "workflow", pattern);
				}
			}
		} else {
			console.log("No workflow patterns found in memory:", {
				hasPatterns: !!this.memory?.patterns,
				isArray: Array.isArray(this.memory?.patterns),
				patterns: this.memory?.patterns,
			});
		}

		return contexts;
	}
}

// Export a singleton instance
let globalMatcher: SimpleContextMatcher | null = null;

export function getSimpleContextMatcher(): SimpleContextMatcher {
	if (!globalMatcher) {
		globalMatcher = new SimpleContextMatcher();
	}
	return globalMatcher;
}
