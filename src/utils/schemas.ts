// Structured output schemas for AI and runtime validation

import { z } from "zod/v4";

export const ChunkSchema = z
	.object({
		chunks: z
			.object({
				startIndex: z
					.number()
					.describe(
						"Index of the first timestamp in this session from the provided data array (e.g., 0, 5, 12). IMPORTANT: Use the index shown in brackets [n] from the input data",
					),
				endIndex: z
					.number()
					.describe(
						"Index of the last timestamp in this session from the provided data array (e.g., 4, 11, 23). IMPORTANT: Use the index shown in brackets [n] from the input data",
					),
				description: z
					.string()
					.describe(
						"Provide a descriptive label for the session based on its timing and content (e.g., 'Morning Work Session', 'Evening Research').",
					),
			})
			.array()
			.nonempty()
			.describe(
				"An array of distinct browsing sessions. A new session begins after a >30 minute gap in activity. Sessions can span multiple days if activity is continuous.",
			),
	})
	.describe(
		"Browsing sessions grouped by natural time gaps (>30min gap = new session)",
	);
const WorkflowPatternSchema = z.object({
	pattern: z
		.string()
		.describe(
			"Short, descriptive name for the identified workflow (max 100 chars, e.g., 'Morning News Review', 'Daily Standup Prep')",
		),
	description: z
		.string()
		.describe(
			"1-2 sentence summary of the user's goal and the steps in this recurring workflow (max 200 chars)",
		),
	frequency: z.number().describe("How often this pattern occured"),
	urls: z
		.array(z.url())
		.describe("Example URLs that are part of this workflow (max 5 URLs)"),
	timePattern: z
		.string()
		.optional()
		.describe(
			"When this pattern typically occurs (max 50 chars, e.g., 'mornings', 'weekdays', 'hourly')",
		),
	suggestion: z
		.string()
		.describe(
			"Concrete, actionable suggestion to optimize or automate this workflow (max 200 chars, e.g., 'Bookmark this set of URLs in a folder').",
		),
	automationPotential: z
		.enum(["high", "medium", "low"])
		.describe("Classify the automation potential for this workflow"),
});

export const WorkflowPatternsOnlySchema = z
	.array(WorkflowPatternSchema)
	.describe(
		"Workflow patterns discovered in browsing history with URLs, frequencies, and automation opportunities (max 10 patterns)",
	);

export const UserProfileSchema = z.object({
	stableTraits: z
		.object({
			coreIdentities: z
				.array(z.string().describe("max 80 chars"))
				.describe(
					"List the user's core roles and identities based on strong, repeated evidence (max 5 items, e.g., 'Software Developer', 'Language Learner', 'Hobbyist Photographer').",
				),
			personalPreferences: z
				.array(
					z.object({
						category: z
							.string()
							.describe(
								"Category of preference (max 40 chars, e.g., Style, Travel, Diet, UI, Music, Coffee, Reading, Fitness)",
							),
						preference: z
							.string()
							.describe(
								"Specific preference (max 80 chars, e.g., Minimalist capsule wardrobe, prefers night trains, vegetarian, dark-theme, techno at 124 BPM)",
							),
					}),
				)
				.describe(
					"List the user's enduring preferences, each with a category and specific detail, based on consistent browsing signals (max 8 preferences).",
				),
		})
		.describe(
			"Stable traits that require high evidence (2+ distinct browsing signals) to establish or modify",
		),
	dynamicContext: z
		.object({
			currentTasks: z
				.array(z.string().describe("max 80 chars"))
				.describe(
					"List the user's active, short-to-medium term goals or projects based on recent, focused activity (max 10 tasks, e.g., 'Plan a vacation', 'Learn a new technology').",
				),
			currentInterests: z
				.array(z.string().describe("max 60 chars"))
				.describe(
					"List topics of recent, sustained interest based on browsing patterns (max 8 interests, e.g., 'AI Ethics', 'European travel', 'Watercolor techniques').",
				),
		})
		.describe(
			"Dynamic context that updates frequently based on recent browsing activity",
		),
	summary: z
		.string()
		.describe(
			"1-2 sentence narrative summary that synthesizes the user's core identity, primary interests, and current focus into a coherent picture (max 500 chars).",
		),
});

export const AnalysisResultSchema = z.object({
	patterns: WorkflowPatternsOnlySchema,
	userProfile: UserProfileSchema,
});
