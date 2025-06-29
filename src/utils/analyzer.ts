import type { AnalysisResult } from "../types";
import { createChromeAISession } from "./chrome-ai";

// Calculate statistics from Chrome history items
export function calculateStats(items: chrome.history.HistoryItem[]): {
	totalUrls: number;
	topDomains: { domain: string; count: number }[];
	dateRange: { start: Date; end: Date };
} {
	if (!items || items.length === 0) {
		return {
			totalUrls: 0,
			topDomains: [],
			dateRange: {
				start: new Date(),
				end: new Date(),
			},
		};
	}

	// Calculate domain frequencies
	const domains = new Map<string, number>();
	items.forEach((item) => {
		if (item.url) {
			try {
				const url = new URL(item.url);
				const domain = url.hostname;
				domains.set(domain, (domains.get(domain) || 0) + 1);
			} catch {
				// Invalid URL, skip
			}
		}
	});

	const topDomains = Array.from(domains.entries())
		.map(([domain, count]) => ({ domain, count }))
		.sort((a, b) => b.count - a.count)
		.slice(0, 10);

	// Calculate date range
	const timestamps = items
		.map((item) => item.lastVisitTime)
		.filter((time): time is number => time !== undefined);

	const dateRange =
		timestamps.length > 0
			? {
					start: new Date(Math.min(...timestamps)),
					end: new Date(Math.max(...timestamps)),
				}
			: {
					start: new Date(),
					end: new Date(),
				};

	return {
		totalUrls: items.length,
		topDomains,
		dateRange,
	};
}

// Analyze Chrome history items directly
export async function analyzeHistoryItems(
	items: chrome.history.HistoryItem[],
	customSystemPrompt?: string,
): Promise<AnalysisResult> {
	const stats = calculateStats(items);

	// Prepare data for analysis
	const historyData = items.map((item) => {
		let domain = "";
		try {
			if (item.url) {
				const url = new URL(item.url);
				domain = url.hostname;
			}
		} catch {
			// Invalid URL
		}

		return {
			url: item.url || "",
			title: item.title || "",
			domain,
			lastVisitTime: item.lastVisitTime
				? new Date(item.lastVisitTime).toISOString()
				: "",
			visitCount: item.visitCount || 0,
			typedCount: item.typedCount || 0,
		};
	});

	// Create the analysis prompt
	const prompt = `Analyze this browsing history data and identify repetitive workflows that can be automated or optimized.

Summary:
- Total URLs: ${stats.totalUrls}
- Date range: ${stats.dateRange.start.toISOString()} to ${stats.dateRange.end.toISOString()}
- Top domains: ${stats.topDomains
		.slice(0, 5)
		.map((d) => `${d.domain} (${d.count} visits)`)
		.join(", ")}

History entries (showing first 100):
${JSON.stringify(historyData.slice(0, 100), null, 2)}

Please identify:
1. Repetitive patterns in browsing behavior
2. Common workflows that appear multiple times
3. Time-based routines (daily, weekly, etc.)
4. Opportunities for automation or optimization

Focus on the most frequently visited sites and common workflows.`;

	const session = await createChromeAISession(
		customSystemPrompt ||
			"You are a helpful assistant that analyzes browsing patterns to identify repetitive workflows and opportunities for automation.",
	);

	if (!session) {
		throw new Error(
			"Chrome AI is not available. Please use Chrome 131+ with AI features enabled.",
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
				return {
					patterns: [],
					totalUrls: stats.totalUrls,
					dateRange: stats.dateRange,
					topDomains: stats.topDomains,
				};
			}

			return {
				patterns: parsed.patterns,
				totalUrls: stats.totalUrls,
				dateRange: stats.dateRange,
				topDomains: stats.topDomains,
			};
		} catch (error) {
			console.error("Failed to parse Chrome AI analysis response:", error);
			console.debug("Raw response:", response);
			return {
				patterns: [],
				totalUrls: stats.totalUrls,
				dateRange: stats.dateRange,
				topDomains: stats.topDomains,
			};
		}
	} finally {
		session.destroy();
	}
}
