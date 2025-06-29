// Structured output schemas for Chrome AI

export const ANALYSIS_SCHEMA = {
	type: "object",
	properties: {
		patterns: {
			type: "array",
			items: {
				type: "object",
				properties: {
					pattern: { type: "string" },
					description: { type: "string" },
					frequency: { type: "number" },
					urls: {
						type: "array",
						items: { type: "string" },
					},
					timePattern: { type: "string" },
					suggestion: { type: "string" },
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
				profession: { type: "string" },
				interests: {
					type: "array",
					items: { type: "string" },
				},
				workPatterns: {
					type: "array",
					items: {
						type: "object",
						properties: {
							type: { type: "string" },
							description: { type: "string" },
						},
						required: ["type", "description"],
					},
				},
				personalityTraits: {
					type: "array",
					items: {
						type: "object",
						properties: {
							trait: { type: "string" },
							evidence: { type: "string" },
						},
						required: ["trait", "evidence"],
					},
				},
				technologyUse: {
					type: "array",
					items: {
						type: "object",
						properties: {
							category: { type: "string" },
							level: {
								type: "string",
								enum: ["beginner", "intermediate", "advanced", "expert"],
							},
							tools: {
								type: "array",
								items: { type: "string" },
							},
						},
						required: ["category", "level", "tools"],
					},
				},
				summary: { type: "string" },
			},
			required: [
				"profession",
				"interests",
				"workPatterns",
				"personalityTraits",
				"technologyUse",
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
					startTime: {
						type: "number",
						description:
							"Milliseconds since epoch (13-digit number like 1751194854628)",
					},
					endTime: {
						type: "number",
						description:
							"Milliseconds since epoch (13-digit number like 1751194854628)",
					},
					description: { type: "string" }, // e.g., "Morning work session"
				},
				required: ["startTime", "endTime", "description"],
			},
		},
	},
	required: ["chunks"],
};
