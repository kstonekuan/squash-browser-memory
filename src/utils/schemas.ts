// Structured output schemas for Chrome AI and runtime validation

import { toJSONSchema, z } from "zod/v4";

// Zod schemas for runtime validation
const WorkflowPatternSchema = z.object({
	pattern: z.string().max(100).describe("Short name for the workflow pattern"),
	description: z
		.string()
		.max(200)
		.describe("Detailed description of what this workflow involves"),
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
			"Actionable suggestion for optimizing or automating this workflow",
		),
	automationPotential: z
		.enum(["high", "medium", "low"])
		.describe("How suitable this workflow is for automation"),
});

const UserProfileSchema = z.object({
	stableTraits: z
		.object({
			coreIdentities: z
				.array(z.string().max(80))
				.max(5)
				.describe(
					"Roles someone would claim as part of their identity. Examples: Senior UX Designer, Parent of two, Weekend volunteer firefighter, Dancer, Marathon runner",
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
				.describe("Enduring personal choices and preferences"),
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
					"Active goals and tasks the user is working on. Examples: Land 6-month retainer, Redesign app onboarding, Reach B2 Portuguese, Cycle Camino de Santiago, Publish UX case-study, Build Notion templates",
				),
			currentInterests: z
				.array(z.string().max(60))
				.max(8)
				.describe(
					"Recent areas of focus and interest. Examples: Figma micro-interactions, Zero-waste travel, EU Digital Services Act, Watercolor journaling, Figma variables beta, Interrail pricing, AI ethics, Lisbon coworking",
				),
		})
		.describe(
			"Dynamic context that updates frequently based on recent browsing activity",
		),
	summary: z
		.string()
		.max(500)
		.describe(
			"A vivid sentence combining the person's identities, preferences, and current focus",
		),
});

export const AnalysisResultSchema = z.object({
	patterns: z
		.array(WorkflowPatternSchema)
		.max(15)
		.describe(
			"Workflow patterns discovered in browsing history with URLs, frequencies, and automation opportunities",
		),
	userProfile: UserProfileSchema,
});

export const ChunkSchema = z
	.object({
		chunks: z
			.array(
				z.object({
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
							"Descriptive label for this session (e.g., 'Morning work session', 'Evening research', 'Weekend browsing')",
						),
				}),
			)
			.describe(
				"Array of browsing sessions. Rules: Gap >30min = new session, Sessions can span days if continuous, Return at least 1 chunk",
			),
	})
	.describe(
		"Browsing sessions grouped by natural time gaps (>30min gap = new session)",
	);

// Schema for user profile only (no patterns)
const UserProfileOnlySchema = z.object({
	userProfile: UserProfileSchema,
});

// Schema for workflow patterns only (no user profile)
const WorkflowPatternsOnlySchema = z.object({
	patterns: z
		.array(WorkflowPatternSchema)
		.max(15)
		.describe(
			"Workflow patterns discovered in browsing history with URLs, frequencies, and automation opportunities",
		),
});

// Generate JSON schemas from Zod schemas for Chrome AI
export const ANALYSIS_SCHEMA = toJSONSchema(AnalysisResultSchema);
const ANALYSIS_SCHEMA_NO_PATTERNS = toJSONSchema(UserProfileOnlySchema);
const WORKFLOW_PATTERNS_ONLY_SCHEMA = toJSONSchema(WorkflowPatternsOnlySchema);
export const CHUNK_SCHEMA = toJSONSchema(ChunkSchema);

// Function to get appropriate schema based on settings
export function getAnalysisSchema(includePatterns: boolean) {
	return includePatterns ? ANALYSIS_SCHEMA : ANALYSIS_SCHEMA_NO_PATTERNS;
}

// Export workflow patterns schema
export function getWorkflowPatternsSchema() {
	return WORKFLOW_PATTERNS_ONLY_SCHEMA;
}
