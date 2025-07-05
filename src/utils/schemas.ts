// Structured output schemas for Chrome AI

import { z } from "zod";

export const ANALYSIS_SCHEMA = {
	type: "object",
	properties: {
		patterns: {
			type: "array",
			maxItems: 15,
			items: {
				type: "object",
				properties: {
					pattern: { type: "string", maxLength: 100 },
					description: { type: "string", maxLength: 200 },
					frequency: { type: "number" },
					urls: {
						type: "array",
						items: { type: "string", maxLength: 150 },
						maxItems: 5,
					},
					timePattern: { type: "string", maxLength: 50 },
					suggestion: { type: "string", maxLength: 200 },
					automationPotential: {
						type: "string",
						enum: ["high", "medium", "low"],
					},
				},
				required: [
					"pattern",
					"description",
					"frequency",
					"urls",
					"suggestion",
					"automationPotential",
				],
			},
		},
		userProfile: {
			type: "object",
			properties: {
				// === Stable Background ===
				coreIdentities: {
					type: "array",
					items: { type: "string", maxLength: 80 },
					maxItems: 5,
				},
				personalPreferences: {
					type: "array",
					items: {
						type: "object",
						properties: {
							category: { type: "string", maxLength: 40 },
							preference: { type: "string", maxLength: 80 },
						},
						required: ["category", "preference"],
					},
					maxItems: 8,
				},

				// === Current Context ===
				currentTasks: {
					type: "array",
					items: { type: "string", maxLength: 80 },
					maxItems: 10,
				},
				currentInterests: {
					type: "array",
					items: { type: "string", maxLength: 60 },
					maxItems: 8,
				},

				// === Overall Summary ===
				summary: { type: "string", maxLength: 500 },
			},
			required: [
				"coreIdentities",
				"personalPreferences",
				"currentTasks",
				"currentInterests",
				"summary",
			],
		},
	},
	required: ["patterns", "userProfile"],
};

export const CHUNK_SCHEMA = {
	type: "object",
	properties: {
		chunks: {
			type: "array",
			items: {
				type: "object",
				properties: {
					startIndex: {
						type: "number",
						description:
							"Index of the first timestamp in this session (e.g., 0, 5, 12)",
					},
					endIndex: {
						type: "number",
						description:
							"Index of the last timestamp in this session (e.g., 4, 11, 23)",
					},
					description: { type: "string" }, // e.g., "Morning work session"
				},
				required: ["startIndex", "endIndex", "description"],
			},
		},
	},
	required: ["chunks"],
};

// Zod schemas for runtime validation
const WorkflowPatternSchema = z.object({
	pattern: z.string().max(100),
	description: z.string().max(200),
	frequency: z.number(),
	urls: z.array(z.string().max(150)).max(5),
	timePattern: z.string().max(50).optional(),
	suggestion: z.string().max(200),
	automationPotential: z.enum(["high", "medium", "low"]),
});

const UserProfileSchema = z.object({
	coreIdentities: z.array(z.string().max(80)).max(5),
	personalPreferences: z
		.array(
			z.object({
				category: z.string().max(40),
				preference: z.string().max(80),
			}),
		)
		.max(8),
	currentTasks: z.array(z.string().max(80)).max(10),
	currentInterests: z.array(z.string().max(60)).max(8),
	summary: z.string().max(500),
});

export const AnalysisResultSchema = z.object({
	patterns: z.array(WorkflowPatternSchema).max(15),
	userProfile: UserProfileSchema,
});

export const ChunkSchema = z.object({
	chunks: z.array(
		z.object({
			startIndex: z.number(),
			endIndex: z.number(),
			description: z.string(),
		}),
	),
});
