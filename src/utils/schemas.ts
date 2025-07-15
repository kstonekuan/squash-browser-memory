// Structured output schemas for AI and runtime validation

import { toJSONSchema, z } from "zod/v4";

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
		.max(100)
		.describe(
			"Short, descriptive name for the identified workflow (e.g., 'Morning News Review', 'Daily Standup Prep')",
		),
	description: z
		.string()
		.max(200)
		.describe(
			"1-2 sentence summary of the user's goal and the steps in this recurring workflow",
		),
	frequency: z
		.number()
		.describe(
			"How often this pattern occurs (e.g., number of times per day/week)",
		),
	urls: z
		.array(z.string().max(150))
		.max(5)
		.describe("Example URLs that are part of this workflow"),
	timePattern: z
		.string()
		.max(50)
		.optional()
		.describe(
			"When this pattern typically occurs (e.g., 'mornings', 'weekdays', 'hourly')",
		),
	suggestion: z
		.string()
		.max(200)
		.describe(
			"Concrete, actionable suggestion to optimize or automate this workflow (e.g., 'Bookmark this set of URLs in a folder').",
		),
	automationPotential: z
		.enum(["high", "medium", "low"])
		.describe("Classify the automation potential for this workflow"),
});
// Schema for workflow patterns only (no user profile)
export const WorkflowPatternsOnlySchema = z
	.array(WorkflowPatternSchema)
	.max(15)
	.describe(
		"Workflow patterns discovered in browsing history with URLs, frequencies, and automation opportunities",
	);

export const UserProfileSchema = z.object({
	stableTraits: z
		.object({
			coreIdentities: z
				.array(z.string().max(80))
				.max(5)
				.describe(
					"List the user's core roles and identities based on strong, repeated evidence (e.g., 'Software Developer', 'Language Learner', 'Hobbyist Photographer').",
				),
			personalPreferences: z
				.array(
					z.object({
						category: z
							.string()
							.max(40)
							.describe(
								"Category of preference (e.g., Style, Travel, Diet, UI, Music, Coffee, Reading, Fitness)",
							),
						preference: z
							.string()
							.max(80)
							.describe(
								"Specific preference (e.g., Minimalist capsule wardrobe, prefers night trains, vegetarian, dark-theme, techno at 124 BPM)",
							),
					}),
				)
				.max(8)
				.describe(
					"List the user's enduring preferences, each with a category and specific detail, based on consistent browsing signals.",
				),
		})
		.describe(
			"Stable traits that require high evidence (2+ distinct browsing signals) to establish or modify",
		),
	dynamicContext: z
		.object({
			currentTasks: z
				.array(z.string().max(80))
				.max(10)
				.describe(
					"List the user's active, short-to-medium term goals or projects based on recent, focused activity (e.g., 'Plan a vacation', 'Learn a new technology').",
				),
			currentInterests: z
				.array(z.string().max(60))
				.max(8)
				.describe(
					"List topics of recent, sustained interest based on browsing patterns (e.g., 'AI Ethics', 'European travel', 'Watercolor techniques').",
				),
		})
		.describe(
			"Dynamic context that updates frequently based on recent browsing activity",
		),
	summary: z
		.string()
		.max(500)
		.describe(
			"1-2 sentence narrative summary that synthesizes the user's core identity, primary interests, and current focus into a coherent picture.",
		),
});

export const AnalysisResultSchema = z.object({
	patterns: WorkflowPatternsOnlySchema,
	userProfile: UserProfileSchema,
});

// Generate JSON schemas from Zod schemas for Chrome AI
export const CHUNK_SCHEMA = toJSONSchema(ChunkSchema);
export const ANALYSIS_SCHEMA = toJSONSchema(AnalysisResultSchema);
export const USER_PROFILE_SCHEMA = toJSONSchema(UserProfileSchema);
export const WORKFLOW_PATTERNS_ONLY_SCHEMA = toJSONSchema(
	WorkflowPatternsOnlySchema,
);
