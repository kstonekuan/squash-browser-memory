import type { AnalysisMemory } from "./memory";
import { loadMemory } from "./memory";

export interface ContextSuggestion {
	text: string;
	category: string;
	relevanceScore: number;
	matchType: "semantic" | "string";
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

	async initialize(): Promise<void> {
		try {
			this.memory = await loadMemory();
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

		// Extract contexts from memory
		const contexts = this.extractContextsFromMemory();

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
	}> {
		if (!this.memory?.userProfile) return [];

		const contexts: Array<{ text: string; category: string }> = [];
		const profile = this.memory.userProfile;

		// Helper function to safely add context
		const addContext = (value: unknown, category: string) => {
			if (value && typeof value === "string" && value.trim()) {
				contexts.push({ text: value.trim(), category });
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

		// Add profession
		addContext(profile.profession, "profession");

		// Add interests (string array)
		addArrayItems(profile.interests, "interests");

		// Add current goals (string array)
		addArrayItems(profile.currentGoals, "goals");

		// Add lifecycle hints (string array)
		addArrayItems(profile.lifecycleHints, "lifecycle");

		// Add personal preferences (object array: {category, preference})
		addObjectArray(profile.personalPreferences, "preferences", (item) => {
			const obj = item as { category?: string; preference?: string };
			return `${obj.category || ""}: ${obj.preference || ""}`;
		});

		// Add personality traits (object array: {trait, evidence})
		addObjectArray(profile.personalityTraits, "traits", (item) => {
			const obj = item as { trait?: string; evidence?: string };
			return (obj.trait || "") + (obj.evidence ? ` (${obj.evidence})` : "");
		});

		// Add technology use (object array: {category, level, tools})
		addObjectArray(profile.technologyUse, "technology", (item) => {
			const obj = item as {
				category?: string;
				level?: string;
				tools?: string[] | string;
			};
			const tools = Array.isArray(obj.tools)
				? obj.tools.join(", ")
				: obj.tools || "";
			return `${obj.category || ""} (${obj.level || ""}): ${tools}`;
		});

		// Add work patterns (object array: {type, description})
		addObjectArray(profile.workPatterns, "patterns", (item) => {
			const obj = item as { type?: string; description?: string };
			return `${obj.type || ""}: ${obj.description || ""}`;
		});

		// Add recent obsessions (string array)
		addArrayItems(profile.recentObsessions, "obsessions");

		// Add summary as a single context item
		addContext(profile.summary, "summary");

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
