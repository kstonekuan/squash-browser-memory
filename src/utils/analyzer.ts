import type {
	AnalysisResult,
	ChunkInfo,
	UserProfile,
	WorkflowPattern,
} from "../types";
import { createChromeAISession } from "./chrome-ai";
import { createHistoryChunks, identifyChunks } from "./chunking";
import {
	buildAnalysisPrompt,
	buildMergePrompt,
	DEFAULT_SYSTEM_PROMPT,
} from "./constants";
import {
	type AnalysisMemory,
	createEmptyMemory,
	loadMemory,
	saveMemory,
} from "./memory";
import { ANALYSIS_SCHEMA } from "./schemas";

// Re-export clearMemory for use in UI
export { clearMemory } from "./memory";

// Export for testing
export { hideTrackingParams };

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
			dateRange: { start: new Date(), end: new Date() },
		};
	}

	// Calculate domain frequencies
	const domains = items.reduce((acc, item) => {
		if (item.url) {
			try {
				const domain = new URL(item.url).hostname;
				acc.set(domain, (acc.get(domain) || 0) + 1);
			} catch {
				// Invalid URL, skip
			}
		}
		return acc;
	}, new Map<string, number>());

	const topDomains = Array.from(domains.entries())
		.map(([domain, count]) => ({ domain, count }))
		.sort((a, b) => b.count - a.count)
		.slice(0, 10);

	// Calculate date range
	const timestamps = items
		.map((item) => item.lastVisitTime)
		.filter((time): time is number => !!time);

	const dateRange =
		timestamps.length > 0
			? {
					start: new Date(Math.min(...timestamps)),
					end: new Date(Math.max(...timestamps)),
				}
			: { start: new Date(), end: new Date() };

	return {
		totalUrls: items.length,
		topDomains,
		dateRange,
	};
}

// Progress callback type with more detailed information
export type ProgressCallback = (info: {
	phase: "calculating" | "chunking" | "analyzing" | "retrying";
	currentChunk?: number;
	totalChunks?: number;
	chunkDescription?: string;
	retryMessage?: string;
}) => void;

// Custom prompts interface
export interface CustomPrompts {
	systemPrompt?: string;
	chunkPrompt?: string;
}

// Analyze Chrome history items with memory and chunking
export async function analyzeHistoryItems(
	items: chrome.history.HistoryItem[],
	customPrompts?: CustomPrompts,
	onProgress?: ProgressCallback,
	abortSignal?: AbortSignal,
): Promise<AnalysisResult> {
	// Check if already aborted
	if (abortSignal?.aborted) {
		throw new Error("Analysis cancelled");
	}

	// Notify that we're calculating statistics
	if (onProgress) onProgress({ phase: "calculating" });
	console.log("Starting analysis with", items.length, "items");
	const stats = calculateStats(items);

	// Load existing memory
	let memory = await loadMemory();
	if (!memory) {
		memory = createEmptyMemory();
	}
	console.log(
		"Memory loaded, items previously analyzed:",
		memory.totalItemsAnalyzed,
	);

	// Check if aborted before chunking
	if (abortSignal?.aborted) {
		throw new Error("Analysis cancelled");
	}

	// Identify chunks using AI
	if (onProgress) onProgress({ phase: "chunking" });
	console.log("Starting chunking phase");
	const chunkingResult = await identifyChunks(
		items,
		customPrompts?.chunkPrompt,
	);
	console.log(
		"Chunking result:",
		chunkingResult.timeRanges.length,
		"chunks identified",
	);
	const chunks = createHistoryChunks(
		items,
		chunkingResult.timeRanges,
		chunkingResult.isFallback,
	);
	console.log("Created", chunks.length, "chunks for processing");

	if (chunks.length === 0) {
		return {
			patterns: memory.patterns,
			totalUrls: stats.totalUrls,
			dateRange: stats.dateRange,
			topDomains: stats.topDomains,
			userProfile: memory.userProfile,
			chunks: [],
			chunkingRawResponse: chunkingResult.rawResponse,
			chunkingError: chunkingResult.error,
		};
	}

	// Store chunk info for the result
	const chunkInfos: ChunkInfo[] = chunks.map((chunk, index) => {
		// Find the corresponding time range for description
		const timeRange = chunkingResult.timeRanges[index];
		return {
			startTime: chunk.startTime,
			endTime: chunk.endTime,
			itemCount: chunk.items.length,
			description: chunk.isFallback
				? `${chunk.startTime.toLocaleDateString()} ${chunk.startTime.getHours() < 12 ? "Morning" : "Afternoon/Evening"} (Fallback)`
				: timeRange?.description || `Session ${index + 1}`,
			isFallback: chunk.isFallback,
		};
	});

	// Process each chunk
	let processedChunks = 0;
	const totalChunks = chunks.length;

	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i];

		// Check if aborted before processing chunk
		if (abortSignal?.aborted) {
			throw new Error("Analysis cancelled");
		}

		processedChunks++;

		if (onProgress) {
			onProgress({
				phase: "analyzing",
				currentChunk: processedChunks,
				totalChunks,
				chunkDescription: `${chunk.startTime.toLocaleDateString()} - ${chunk.endTime.toLocaleDateString()}`,
			});
		}

		try {
			console.log(
				`Processing chunk ${i + 1}/${totalChunks} with ${chunk.items.length} items`,
			);
			// Analyze this chunk - if it's too large, subdivide it
			const { processedItems, results } = await analyzeChunkWithSubdivision(
				chunk.items,
				memory,
				customPrompts?.systemPrompt,
				onProgress,
				abortSignal,
				processedChunks,
				totalChunks,
			);

			// Update memory with merged results
			if (results) {
				memory = {
					userProfile: results.userProfile,
					patterns: results.patterns,
					lastAnalyzedDate: new Date(),
					totalItemsAnalyzed: memory.totalItemsAnalyzed + processedItems,
					version: memory.version,
				};

				// Save memory after each chunk
				await saveMemory(memory);
			}

			// Small delay between chunks to avoid quota issues
			if (i < chunks.length - 1) {
				await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay
			}
		} catch (error) {
			console.error(`Failed to analyze chunk ${i + 1}:`, error);

			// Continue with next chunk even if one fails
		}
	}

	// Return final results from memory
	return {
		patterns: memory.patterns,
		totalUrls: stats.totalUrls,
		dateRange: stats.dateRange,
		topDomains: stats.topDomains,
		userProfile: memory.userProfile,
		chunks: chunkInfos,
		chunkingRawResponse: chunkingResult.rawResponse,
		chunkingError: chunkingResult.error,
	};
}

// Helper function to retry with exponential backoff
async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	maxRetries: number = 3,
	baseDelay: number = 2000,
	onProgress?: ProgressCallback,
	abortSignal?: AbortSignal,
): Promise<T> {
	for (let i = 0; i < maxRetries; i++) {
		try {
			return await fn();
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message.toLowerCase() : "";
			const isQuotaError = errorMessage.includes("quota exceeded");
			const isInputTooLong =
				errorMessage.includes("input too long") ||
				errorMessage.includes("context full");
			const isLastAttempt = i === maxRetries - 1;

			// Don't retry if input is too long - it won't get shorter
			if (isInputTooLong) {
				console.error("Input exceeds token limits, not retrying");
				throw error;
			}

			if (!isQuotaError || isLastAttempt) {
				throw error;
			}

			// Exponential backoff: 2s, 4s, 8s
			const delay = baseDelay * 2 ** i;
			const retryMessage = `Quota exceeded. Retrying in ${delay / 1000} seconds...`;
			console.log(retryMessage);

			if (onProgress) {
				onProgress({
					phase: "retrying",
					retryMessage,
				});
			}

			// Check if already aborted before waiting
			if (abortSignal?.aborted) {
				throw new Error("Analysis cancelled");
			}

			// Wait with abort support
			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(resolve, delay);

				if (abortSignal) {
					const abortHandler = () => {
						clearTimeout(timeout);
						reject(new Error("Analysis cancelled during retry"));
					};

					if (abortSignal.aborted) {
						abortHandler();
					} else {
						abortSignal.addEventListener("abort", abortHandler, { once: true });
					}
				}
			});
		}
	}
	throw new Error("Max retries exceeded");
}

// Simple token counter (approximate but consistent)
function countTokens(text: string): number {
	// Rough approximation: 1 token ≈ 4 characters
	// This is conservative to avoid underestimating
	return Math.ceil(text.length / 3.5);
}

// Hide tracking URL parameters to reduce token usage and protect privacy
function hideTrackingParams(
	params: Record<string, string>,
): Record<string, string> {
	const filtered: Record<string, string> = {};

	// Known tracking/analytics parameters that don't help with browsing pattern analysis
	const trackingParams = new Set([
		// Google Analytics & Ads
		"utm_source",
		"utm_medium",
		"utm_campaign",
		"utm_term",
		"utm_content",
		"gclid",
		"gbraid",
		"wbraid",
		"ga_",
		"gad_source",
		// Facebook
		"fbclid",
		"fb_action_ids",
		"fb_action_types",
		// Microsoft/Bing
		"msclkid",
		// Yahoo
		"yclid",
		// Google Search specific
		"ei",
		"sei",
		"ved",
		"uact",
		"sca_esv",
		"gs_lp",
		"gs_lcrp",
		"sclient",
		"iflsig",
		"aqs",
		"sourceid",
		"ie",
		"oe",
		// Session/tracking IDs
		"sid",
		"sessionid",
		"vid",
		"cid",
		"client_id",
		// Adobe Analytics
		"s_kwcid",
		"ef_id",
		// Other common tracking
		"ref",
		"referer",
		"referrer",
		"source",
	]);

	for (const [key, value] of Object.entries(params)) {
		const lowerKey = key.toLowerCase();

		// Check if it's a tracking parameter
		const isTrackingParam =
			trackingParams.has(lowerKey) || /^(utm_|ga_|fb_|__)/i.test(key);

		if (isTrackingParam) {
			filtered[key] = "<hidden>"; // Make it clear the value was hidden
		} else {
			// Keep all non-tracking parameters intact - they may contain meaningful data
			filtered[key] = value;
		}
	}

	return filtered;
}

// Merge new analysis results with existing results using LLM
async function mergeAnalysisResults(
	memory: AnalysisMemory,
	newResults: { userProfile: UserProfile; patterns: WorkflowPattern[] },
	customSystemPrompt?: string,
	abortSignal?: AbortSignal,
): Promise<{ userProfile: UserProfile; patterns: WorkflowPattern[] }> {
	// Check if aborted
	if (abortSignal?.aborted) {
		throw new Error("Analysis cancelled");
	}

	// If memory is empty, just return the new results
	if (memory.totalItemsAnalyzed === 0) {
		return newResults;
	}

	const mergePrompt = buildMergePrompt(
		{
			userProfile: memory.userProfile,
			patterns: memory.patterns,
			totalItemsAnalyzed: memory.totalItemsAnalyzed,
		},
		newResults,
	);

	const session = await createChromeAISession(
		customSystemPrompt || DEFAULT_SYSTEM_PROMPT,
	);

	if (!session) {
		throw new Error("Chrome AI is not available for merging.");
	}

	try {
		console.log("Sending merge prompt to AI...");
		const response = await session.prompt(mergePrompt, {
			responseConstraint: ANALYSIS_SCHEMA,
		});
		console.log("Merge response received");

		const parsed = JSON.parse(response);

		// Log merge results for debugging
		console.log("Merge operation:", {
			beforePatterns: memory.patterns.length,
			newPatterns: newResults.patterns.length,
			afterPatterns: parsed.patterns?.length || 0,
			sampleBefore: memory.patterns.slice(0, 3).map((p) => p.description),
			sampleNew: newResults.patterns.slice(0, 3).map((p) => p.description),
			sampleAfter:
				parsed.patterns
					?.slice(0, 3)
					.map((p: WorkflowPattern) => p.description) || [],
		});

		// Validate and enforce limits
		const validatedProfile = {
			...parsed.userProfile,
			interests: parsed.userProfile.interests?.slice(0, 10) || [],
			workPatterns: parsed.userProfile.workPatterns?.slice(0, 8) || [],
			personalityTraits:
				parsed.userProfile.personalityTraits?.slice(0, 8) || [],
			technologyUse: parsed.userProfile.technologyUse?.slice(0, 10) || [],
		};

		const validatedPatterns = parsed.patterns?.slice(0, 15) || [];

		return {
			patterns: validatedPatterns,
			userProfile: validatedProfile,
		};
	} catch (error) {
		console.error("Failed to merge with memory, returning new results:", error);
		return newResults;
	} finally {
		session.destroy();
	}
}

// Analyze a chunk with automatic subdivision if it's too large
async function analyzeChunkWithSubdivision(
	items: chrome.history.HistoryItem[],
	memory: AnalysisMemory,
	customSystemPrompt?: string,
	onProgress?: ProgressCallback,
	abortSignal?: AbortSignal,
	chunkNumber?: number,
	totalChunks?: number,
): Promise<{
	processedItems: number;
	results: { userProfile: UserProfile; patterns: WorkflowPattern[] } | null;
}> {
	const TOKEN_LIMIT = 1024;
	const SAFETY_MARGIN = 200; // Large margin to account for system prompt, response formatting, and long URLs
	const MAX_TOKENS = TOKEN_LIMIT - SAFETY_MARGIN;

	// First, try to analyze the entire chunk
	try {
		// Build a test prompt to check token count
		const testHistoryData = items.map((item) => {
			const urlParts: {
				domain: string;
				path: string;
				params: Record<string, string>;
			} = { domain: "", path: "", params: {} };

			try {
				if (item.url) {
					const url = new URL(item.url);
					urlParts.domain = url.hostname;
					urlParts.path = url.pathname;

					const params: Record<string, string> = {};
					url.searchParams.forEach((value, key) => {
						params[key] = value;
					});
					urlParts.params = hideTrackingParams(params);
				}
			} catch {
				const match = item.url?.match(/^https?:\/\/([^/]+)/);
				if (match) {
					urlParts.domain = match[1];
				}
			}

			return {
				d: urlParts.domain,
				p: urlParts.path || "",
				q:
					Object.keys(urlParts.params).length > 0 ? urlParts.params : undefined,
				t: item.title || "",
				ts: item.lastVisitTime || 0,
				v: item.visitCount || 0,
			};
		});

		const testPrompt = buildAnalysisPrompt(items, testHistoryData);
		const tokenCount = countTokens(testPrompt);

		if (tokenCount <= MAX_TOKENS) {
			// Fits within limits, analyze normally
			// Step 1: Analyze the chunk
			const chunkResults = await analyzeChunk(
				items,
				customSystemPrompt,
				onProgress,
				abortSignal,
			);

			// Step 2: Merge with existing memory (skip if memory is empty)
			const mergedResults =
				memory.totalItemsAnalyzed === 0
					? chunkResults
					: await mergeAnalysisResults(
							memory,
							chunkResults,
							customSystemPrompt,
							abortSignal,
						);

			return { processedItems: items.length, results: mergedResults };
		}

		// Too large, need to subdivide
		console.log(
			`Chunk with ${items.length} items (${tokenCount} tokens) exceeds limit, subdividing...`,
		);

		// Binary search for the right size
		let left = 1;
		let right = items.length;
		let optimalSize = 1; // Start with minimum of 1 item

		while (left <= right) {
			const mid = Math.floor((left + right) / 2);
			const testItems = items.slice(0, mid);
			const testData = testHistoryData.slice(0, mid);
			const testPrompt = buildAnalysisPrompt(testItems, testData);
			const testTokenCount = countTokens(testPrompt);

			if (testTokenCount <= MAX_TOKENS) {
				optimalSize = mid;
				left = mid + 1;
			} else {
				right = mid - 1;
			}
		}

		console.log(`Optimal subdivision size: ${optimalSize} items per sub-chunk`);

		// Process in sub-chunks
		let currentMemory = memory;
		let totalProcessed = 0;

		for (let i = 0; i < items.length; i += optimalSize) {
			// Check if aborted before processing sub-chunk
			if (abortSignal?.aborted) {
				throw new Error("Analysis cancelled");
			}

			const subItems = items.slice(i, i + optimalSize);

			if (onProgress) {
				const subChunkNum = Math.floor(i / optimalSize) + 1;
				const totalSubChunks = Math.ceil(items.length / optimalSize);
				const mainChunkInfo =
					chunkNumber && totalChunks
						? `Chunk ${chunkNumber}/${totalChunks}: `
						: "";
				onProgress({
					phase: "analyzing",
					currentChunk: chunkNumber || subChunkNum,
					totalChunks: totalChunks || totalSubChunks,
					chunkDescription: `${mainChunkInfo}Sub-chunk ${subChunkNum}/${totalSubChunks}`,
				});
			}

			// Step 1: Analyze sub-chunk
			const subResults = await analyzeChunk(
				subItems,
				customSystemPrompt,
				undefined, // Don't pass onProgress to avoid duplicate updates
				abortSignal,
			);

			// Step 2: Merge with current memory (skip if current memory is from original empty memory)
			const mergedResults =
				currentMemory.totalItemsAnalyzed === memory.totalItemsAnalyzed &&
				memory.totalItemsAnalyzed === 0
					? subResults
					: await mergeAnalysisResults(
							currentMemory,
							subResults,
							customSystemPrompt,
							abortSignal,
						);

			// Update memory with merged results
			currentMemory = {
				userProfile: mergedResults.userProfile,
				patterns: mergedResults.patterns,
				lastAnalyzedDate: new Date(),
				totalItemsAnalyzed: currentMemory.totalItemsAnalyzed + subItems.length,
				version: currentMemory.version,
			};

			totalProcessed += subItems.length;
		}

		return {
			processedItems: totalProcessed,
			results: {
				userProfile: currentMemory.userProfile,
				patterns: currentMemory.patterns,
			},
		};
	} catch (error) {
		console.error("Failed to analyze chunk even with subdivision:", error);
		throw error;
	}
}

// Analyze a single chunk of history items
async function analyzeChunk(
	items: chrome.history.HistoryItem[],
	customSystemPrompt?: string,
	onProgress?: ProgressCallback,
	abortSignal?: AbortSignal,
): Promise<{ userProfile: UserProfile; patterns: WorkflowPattern[] }> {
	// Parse URLs for all items
	const historyData = items.map((item) => {
		const urlParts: {
			domain: string;
			path: string;
			params: Record<string, string>;
		} = { domain: "", path: "", params: {} };

		try {
			if (item.url) {
				const url = new URL(item.url);
				urlParts.domain = url.hostname;
				urlParts.path = url.pathname;

				// Extract parameters and shorten long values
				const params: Record<string, string> = {};
				url.searchParams.forEach((value, key) => {
					params[key] = value;
				});
				urlParts.params = hideTrackingParams(params);
			}
		} catch {
			// Invalid URL - try to extract domain from URL string
			const match = item.url?.match(/^https?:\/\/([^/]+)/);
			if (match) {
				urlParts.domain = match[1];
			}
		}

		// Return structured data with ALL information preserved
		return {
			d: urlParts.domain, // domain
			p: urlParts.path || "", // full path
			q: Object.keys(urlParts.params).length > 0 ? urlParts.params : undefined, // all query params
			t: item.title || "", // full title
			ts: item.lastVisitTime || 0, // timestamp
			v: item.visitCount || 0, // visit count
		};
	});

	// Build the analysis prompt
	const prompt = buildAnalysisPrompt(items, historyData);
	const tokenCount = countTokens(prompt);

	// This should have been checked by the caller
	if (tokenCount > 1024 - 200) {
		throw new Error(
			`analyzeChunk called with too many items: ${items.length} items, ${tokenCount} tokens`,
		);
	}

	const session = await createChromeAISession(
		customSystemPrompt || DEFAULT_SYSTEM_PROMPT,
	);

	if (!session) {
		throw new Error("Chrome AI is not available.");
	}

	try {
		console.log(
			`Analyzing chunk with ${items.length} items, ${tokenCount} tokens`,
		);
		const response = await retryWithBackoff(
			async () => {
				// Check abort before making request
				if (abortSignal?.aborted) {
					throw new Error("Analysis cancelled");
				}
				console.log("Sending analysis prompt to AI...");
				return await session.prompt(prompt, {
					responseConstraint: ANALYSIS_SCHEMA,
				});
			},
			3,
			2000,
			onProgress,
			abortSignal,
		);
		console.log("Analysis response received");

		try {
			const parsed = JSON.parse(response);

			// Ensure patterns is an array and userProfile exists
			if (!parsed || !Array.isArray(parsed.patterns) || !parsed.userProfile) {
				// Chrome AI analysis response missing required fields
				throw new Error("AI response missing required fields");
			}

			// Validate and enforce limits
			const validatedProfile = {
				...parsed.userProfile,
				interests: parsed.userProfile.interests?.slice(0, 10) || [],
				workPatterns: parsed.userProfile.workPatterns?.slice(0, 8) || [],
				personalityTraits:
					parsed.userProfile.personalityTraits?.slice(0, 8) || [],
				technologyUse: parsed.userProfile.technologyUse?.slice(0, 10) || [],
			};

			const validatedPatterns = parsed.patterns?.slice(0, 15) || [];

			return {
				patterns: validatedPatterns,
				userProfile: validatedProfile,
			};
		} catch (error) {
			// Failed to parse Chrome AI analysis response
			console.error("Failed to parse AI response:", error);
			throw error;
		}
	} finally {
		session.destroy();
	}
}
