// Structured output schemas for Chrome AI

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
