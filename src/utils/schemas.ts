// Structured output schemas for Chrome AI

export const ANALYSIS_SCHEMA = {
	type: "object",
	properties: {
		patterns: {
			type: "array",
			maxItems: 10,
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
				// === Stable Background (Core Identity) ===
				profession: { type: "string", maxLength: 100 },
				personalityTraits: {
					type: "array",
					items: {
						type: "object",
						properties: {
							trait: { type: "string", maxLength: 50 },
							evidence: { type: "string", maxLength: 150 },
						},
						required: ["trait", "evidence"],
					},
					maxItems: 8,
				},
				technologyUse: {
					type: "array",
					items: {
						type: "object",
						properties: {
							category: { type: "string", maxLength: 50 },
							level: {
								type: "string",
								enum: ["beginner", "intermediate", "advanced", "expert"],
							},
							tools: {
								type: "array",
								items: { type: "string", maxLength: 50 },
								maxItems: 5,
							},
						},
						required: ["category", "level", "tools"],
					},
					maxItems: 10,
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

				// === Current Context (Dynamic/Active) ===
				currentGoals: {
					type: "array",
					items: { type: "string", maxLength: 80 },
					maxItems: 6,
				},
				recentObsessions: {
					type: "array",
					items: { type: "string", maxLength: 60 },
					maxItems: 5,
				},
				lifecycleHints: {
					type: "array",
					items: { type: "string", maxLength: 60 },
					maxItems: 4,
				},
				interests: {
					type: "array",
					items: { type: "string", maxLength: 50 },
					maxItems: 10,
				},
				workPatterns: {
					type: "array",
					items: {
						type: "object",
						properties: {
							type: { type: "string", maxLength: 50 },
							description: { type: "string", maxLength: 100 },
						},
						required: ["type", "description"],
					},
					maxItems: 8,
				},

				// === Overall Summary ===
				summary: { type: "string", maxLength: 500 },
			},
			required: [
				"profession",
				"personalityTraits",
				"technologyUse",
				"personalPreferences",
				"currentGoals",
				"recentObsessions",
				"lifecycleHints",
				"interests",
				"workPatterns",
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
