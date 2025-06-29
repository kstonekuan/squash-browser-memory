import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import {
	ANALYSIS_SYSTEM_PROMPT,
	LLM_CONFIG,
	PARSING_SYSTEM_PROMPT,
} from "../config/llm";
import type {
	AIProvider,
	AnalysisResult,
	ChromeHistoryItem,
	StandardizedHistoryData,
	StandardizedHistoryItem,
	WorkflowPattern,
} from "../types";
import { createChromeAISession } from "./chrome-ai";

// Calculate statistics from standardized items
export function calculateStats(
	items: StandardizedHistoryItem[],
): Pick<StandardizedHistoryData, "totalUrls" | "topDomains" | "dateRange"> {
	// Ensure items is a valid array
	if (!items || !Array.isArray(items)) {
		return {
			totalUrls: 0,
			topDomains: [],
			dateRange: {
				start: new Date().toISOString(),
				end: new Date().toISOString(),
			},
		};
	}

	// Calculate domain frequencies
	const domains = new Map<string, number>();
	items.forEach((item) => {
		if (item?.domain) {
			domains.set(item.domain, (domains.get(item.domain) || 0) + 1);
		}
	});

	const topDomains = Array.from(domains.entries())
		.map(([domain, count]) => ({ domain, count }))
		.sort((a, b) => b.count - a.count)
		.slice(0, 10);

	// Calculate date range
	const validTimestamps = items
		.map((item) => {
			const time = new Date(item.timestamp).getTime();
			return Number.isNaN(time) ? null : time;
		})
		.filter((time): time is number => time !== null);

	const dateRange =
		validTimestamps.length > 0
			? {
					start: new Date(Math.min(...validTimestamps)).toISOString(),
					end: new Date(Math.max(...validTimestamps)).toISOString(),
				}
			: {
					start: new Date().toISOString(),
					end: new Date().toISOString(),
				};

	return {
		totalUrls: items.length,
		topDomains,
		dateRange,
	};
}

// Stage 1: Parse raw input into standardized format using LLM
export async function parseToStandardFormat(
	input: string,
	apiKey: string,
	provider: AIProvider,
	inputType: "json" | "text",
): Promise<StandardizedHistoryData> {
	const parsePrompt =
		inputType === "json"
			? `Extract browsing history from this JSON data. For each history entry, extract:
- timestamp (as ISO string)
- url
- domain (just the domain, e.g., "github.com")
- title

JSON data:
${input}`
			: `Extract browsing history from this Chrome history page text. For each history entry, extract:
- timestamp (as ISO string, if no time is shown use today's date)
- url
- domain (just the domain, e.g., "github.com")
- title

Text data:
${input}`;

	try {
		let parsed: { items: StandardizedHistoryItem[] };

		if (provider === "openai") {
			parsed = await parseWithOpenAI(apiKey, parsePrompt);
		} else if (provider === "gemini") {
			parsed = await parseWithGemini(apiKey, parsePrompt);
		} else {
			parsed = await parseWithChromeAI(parsePrompt);
		}

		// Ensure parsed.items exists and is an array
		if (!parsed || !parsed.items || !Array.isArray(parsed.items)) {
			console.error("Invalid parsed data:", parsed);
			throw new Error("Failed to parse history data - invalid format received");
		}

		// Calculate statistics from the parsed data
		const stats = calculateStats(parsed.items);

		return {
			items: parsed.items,
			...stats,
		};
	} catch (error) {
		console.error("Error parsing to standard format:", error);
		throw error;
	}
}

// Helper functions for Stage 1 parsing
async function parseWithOpenAI(apiKey: string, prompt: string) {
	const openai = new OpenAI({
		apiKey,
		dangerouslyAllowBrowser: true,
	});

	const completion = await openai.chat.completions.create({
		model: LLM_CONFIG.openai.parseModel,
		messages: [
			{
				role: "system",
				content: PARSING_SYSTEM_PROMPT,
			},
			{
				role: "user",
				content: prompt,
			},
		],
		temperature: LLM_CONFIG.openai.parseTemperature,
		response_format: { type: "json_object" },
	});

	return JSON.parse(completion.choices[0].message.content || '{"items": []}');
}

async function parseWithGemini(apiKey: string, prompt: string) {
	const genAI = new GoogleGenAI({ apiKey });

	const response = await genAI.models.generateContent({
		model: LLM_CONFIG.gemini.parseModel,
		contents: `${PARSING_SYSTEM_PROMPT}

${prompt}`,
		config: {
			temperature: LLM_CONFIG.gemini.parseTemperature,
			responseMimeType: "application/json",
			responseSchema: {
				type: "object",
				properties: {
					items: {
						type: "array",
						items: {
							type: "object",
							properties: {
								timestamp: { type: "string" },
								url: { type: "string" },
								domain: { type: "string" },
								title: { type: "string" },
							},
							required: ["timestamp", "url", "domain", "title"],
						},
					},
				},
				required: ["items"],
			},
		},
	});

	return JSON.parse(response.text || '{"items": []}');
}

async function parseWithChromeAI(prompt: string) {
	const session = await createChromeAISession(PARSING_SYSTEM_PROMPT);

	if (!session) {
		throw new Error(
			"Chrome AI is not available. Please use Chrome 131+ or select a different AI provider.",
		);
	}

	try {
		// Define the JSON schema for structured output
		const schema = {
			type: "object",
			properties: {
				items: {
					type: "array",
					items: {
						type: "object",
						properties: {
							timestamp: { type: "string" },
							url: { type: "string" },
							domain: { type: "string" },
							title: { type: "string" },
						},
						required: ["timestamp", "url", "domain", "title"],
					},
				},
			},
			required: ["items"],
		};

		const response = await session.prompt(prompt, {
			responseConstraint: schema,
		});

		try {
			const parsed = JSON.parse(response);

			// Ensure items is an array
			if (!parsed || !Array.isArray(parsed.items)) {
				console.error("Chrome AI response missing items array:", parsed);
				return { items: [] };
			}

			return parsed;
		} catch (error) {
			console.error("Failed to parse Chrome AI structured response:", error);
			console.debug("Raw response:", response);
			return { items: [] };
		}
	} finally {
		session.destroy();
	}
}

// Stage 2: Analyze standardized data for patterns
export async function analyzeStandardizedData(
	data: StandardizedHistoryData,
	apiKey: string,
	provider: AIProvider,
): Promise<AnalysisResult> {
	// Create a summary for the analysis prompt
	const prompt = `Analyze this browsing history data and identify repetitive workflows that can be automated or optimized.

Summary:
- Total URLs: ${data.totalUrls}
- Date range: ${data.dateRange.start} to ${data.dateRange.end}
- Top domains: ${data.topDomains
		.slice(0, 5)
		.map((d) => `${d.domain} (${d.count} visits)`)
		.join(", ")}

History entries (showing first 100):
${JSON.stringify(data.items.slice(0, 100), null, 2)}

Please identify:
1. Repetitive patterns in browsing behavior
2. Common workflows that appear multiple times
3. Time-based routines (daily, weekly, etc.)
4. Opportunities for automation or optimization

Focus on the most frequently visited sites and common workflows.`;

	try {
		let analysis: { patterns: WorkflowPattern[] };

		if (provider === "openai") {
			analysis = await analyzeWithOpenAI(apiKey, prompt);
		} else if (provider === "gemini") {
			analysis = await analyzeWithGemini(apiKey, prompt);
		} else {
			analysis = await analyzeWithChromeAI(prompt);
		}

		// Ensure the response has the expected structure
		if (!analysis || !analysis.patterns || !Array.isArray(analysis.patterns)) {
			console.error("Invalid analysis format received from AI:", analysis);
			// Return empty patterns instead of throwing
			return {
				patterns: [],
				totalUrls: data.totalUrls,
				dateRange: {
					start: new Date(data.dateRange.start),
					end: new Date(data.dateRange.end),
				},
				topDomains: data.topDomains,
			};
		}

		return {
			patterns: analysis.patterns,
			totalUrls: data.totalUrls,
			dateRange: {
				start: new Date(data.dateRange.start),
				end: new Date(data.dateRange.end),
			},
			topDomains: data.topDomains,
		};
	} catch (error) {
		console.error("Error analyzing standardized data:", error);
		throw error;
	}
}

export async function analyzeHistoryText(
	historyText: string,
	apiKey: string,
	provider: AIProvider = "openai",
): Promise<AnalysisResult> {
	// Stage 1: Parse to standardized format
	const standardizedData = await parseToStandardFormat(
		historyText,
		apiKey,
		provider,
		"text",
	);

	// Stage 2: Analyze the standardized data
	return analyzeStandardizedData(standardizedData, apiKey, provider);
}

export async function analyzeHistory(
	historyItems: ChromeHistoryItem[],
	apiKey: string,
	provider: AIProvider = "openai",
): Promise<AnalysisResult> {
	// Stage 1: Parse to standardized format
	const standardizedData = await parseToStandardFormat(
		JSON.stringify(historyItems),
		apiKey,
		provider,
		"json",
	);

	// Stage 2: Analyze the standardized data
	return analyzeStandardizedData(standardizedData, apiKey, provider);
}

async function analyzeWithOpenAI(apiKey: string, prompt: string) {
	const openai = new OpenAI({
		apiKey,
		dangerouslyAllowBrowser: true,
	});

	const completion = await openai.chat.completions.create({
		model: LLM_CONFIG.openai.analyzeModel,
		messages: [
			{
				role: "system",
				content: `${ANALYSIS_SYSTEM_PROMPT}
        
        Return your analysis as a JSON object.`,
			},
			{
				role: "user",
				content: prompt,
			},
		],
		temperature: LLM_CONFIG.openai.analyzeTemperature,
		response_format: { type: "json_object" },
	});

	return JSON.parse(completion.choices[0].message.content || "{}");
}

async function analyzeWithGemini(apiKey: string, prompt: string) {
	const genAI = new GoogleGenAI({ apiKey });

	const fullPrompt = `${ANALYSIS_SYSTEM_PROMPT}\n\n${prompt}`;

	const response = await genAI.models.generateContent({
		model: LLM_CONFIG.gemini.analyzeModel,
		contents: fullPrompt,
		config: {
			temperature: LLM_CONFIG.gemini.analyzeTemperature,
			responseMimeType: "application/json",
			responseSchema: {
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
				},
				required: ["patterns"],
			},
		},
	});

	return JSON.parse(response.text || "{}");
}

async function analyzeWithChromeAI(prompt: string) {
	const session = await createChromeAISession(ANALYSIS_SYSTEM_PROMPT);

	if (!session) {
		throw new Error(
			"Chrome AI is not available. Please use Chrome 131+ or select a different AI provider.",
		);
	}

	try {
		// Define the JSON schema for structured output
		const schema = {
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
			},
			required: ["patterns"],
		};

		const response = await session.prompt(prompt, {
			responseConstraint: schema,
		});

		try {
			const parsed = JSON.parse(response);

			// Ensure patterns is an array
			if (!parsed || !Array.isArray(parsed.patterns)) {
				console.error(
					"Chrome AI analysis response missing patterns array:",
					parsed,
				);
				return { patterns: [] };
			}

			return { patterns: parsed.patterns };
		} catch (error) {
			console.error("Failed to parse Chrome AI analysis response:", error);
			console.debug("Raw response:", response);
			return { patterns: [] };
		}
	} finally {
		session.destroy();
	}
}
