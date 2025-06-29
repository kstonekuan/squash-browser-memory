import type {
	AnalysisResult,
	ChunkInfo,
	UserProfile,
	WorkflowPattern,
} from "../types";
import { createChromeAISession } from "./chrome-ai";
import { createHistoryChunks, identifyChunks } from "./chunking";
import { buildAnalysisPrompt, DEFAULT_SYSTEM_PROMPT } from "./constants";
import {
	type AnalysisMemory,
	createEmptyMemory,
	loadMemory,
	saveMemory,
} from "./memory";
import { ANALYSIS_SCHEMA } from "./schemas";

// Re-export clearMemory for use in UI
export { clearMemory } from "./memory";

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
	const stats = calculateStats(items);

	// Load existing memory
	let memory = await loadMemory();
	if (!memory) {
		memory = createEmptyMemory();
	}

	// Check if aborted before chunking
	if (abortSignal?.aborted) {
		throw new Error("Analysis cancelled");
	}

	// Identify chunks using AI
	if (onProgress) onProgress({ phase: "chunking" });
	const chunkingResult = await identifyChunks(
		items,
		customPrompts?.chunkPrompt,
	);
	const chunks = createHistoryChunks(
		items,
		chunkingResult.timeRanges,
		chunkingResult.isFallback,
	);

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
			// Analyze this chunk - if it's too large, subdivide it
			const { processedItems, results } = await analyzeChunkWithSubdivision(
				chunk.items,
				memory,
				customPrompts?.systemPrompt,
				onProgress,
				abortSignal,
			);

			// Update memory with new results (AI has already done the merging)
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

			// Add a delay between chunks to avoid quota issues
			if (i < chunks.length - 1) {
				await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
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

// Analyze a chunk with automatic subdivision if it's too large
async function analyzeChunkWithSubdivision(
	items: chrome.history.HistoryItem[],
	memory: AnalysisMemory,
	customSystemPrompt?: string,
	onProgress?: ProgressCallback,
	abortSignal?: AbortSignal,
): Promise<{
	processedItems: number;
	results: { userProfile: UserProfile; patterns: WorkflowPattern[] } | null;
}> {
	const TOKEN_LIMIT = 1024;
	const SAFETY_MARGIN = 50;
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
					urlParts.params = params;
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

		const testPrompt = buildAnalysisPrompt(items, testHistoryData, memory);
		const tokenCount = countTokens(testPrompt);

		if (tokenCount <= MAX_TOKENS) {
			// Fits within limits, analyze normally
			const results = await analyzeChunkWithMemory(
				items,
				memory,
				customSystemPrompt,
				onProgress,
				abortSignal,
			);
			return { processedItems: items.length, results };
		}

		// Too large, need to subdivide
		console.log(
			`Chunk with ${items.length} items (${tokenCount} tokens) exceeds limit, subdividing...`,
		);

		// Binary search for the right size
		let left = 1;
		let right = items.length;
		let optimalSize = 5; // Start with minimum

		while (left <= right) {
			const mid = Math.floor((left + right) / 2);
			const testItems = items.slice(0, mid);
			const testData = testHistoryData.slice(0, mid);
			const testPrompt = buildAnalysisPrompt(testItems, testData, memory);
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
			const subItems = items.slice(i, i + optimalSize);

			if (onProgress) {
				onProgress({
					phase: "analyzing",
					currentChunk: Math.floor(i / optimalSize) + 1,
					totalChunks: Math.ceil(items.length / optimalSize),
					chunkDescription: `Sub-chunk ${Math.floor(i / optimalSize) + 1} of ${Math.ceil(items.length / optimalSize)}`,
				});
			}

			const subResults = await analyzeChunkWithMemory(
				subItems,
				currentMemory,
				customSystemPrompt,
				onProgress,
				abortSignal,
			);

			// Update memory with sub-chunk results
			currentMemory = {
				userProfile: subResults.userProfile,
				patterns: subResults.patterns,
				lastAnalyzedDate: new Date(),
				totalItemsAnalyzed: currentMemory.totalItemsAnalyzed + subItems.length,
				version: currentMemory.version,
			};

			totalProcessed += subItems.length;

			// Small delay between sub-chunks
			if (i + optimalSize < items.length) {
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
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

// Analyze a single chunk with memory context
async function analyzeChunkWithMemory(
	items: chrome.history.HistoryItem[],
	memory: AnalysisMemory,
	customSystemPrompt?: string,
	onProgress?: ProgressCallback,
	abortSignal?: AbortSignal,
): Promise<{ userProfile: UserProfile; patterns: WorkflowPattern[] }> {
	const TOKEN_LIMIT = 1024;
	const SAFETY_MARGIN = 50;
	const MAX_TOKENS = TOKEN_LIMIT - SAFETY_MARGIN;

	// Start with a subset of items and incrementally add more
	let itemsToAnalyze = items.slice(0, 5); // Start with 5 items
	let prompt = "";
	let tokenCount = 0;

	// Keep adding items until we approach the token limit
	for (let i = 5; i <= items.length; i += 5) {
		// Parse URLs for current set of items
		const currentHistoryData = itemsToAnalyze.map((item) => {
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

					// Extract ALL parameters - no filtering or truncation
					const params: Record<string, string> = {};
					url.searchParams.forEach((value, key) => {
						params[key] = value;
					});
					urlParts.params = params;
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
				q:
					Object.keys(urlParts.params).length > 0 ? urlParts.params : undefined, // all query params
				t: item.title || "", // full title
				ts: item.lastVisitTime || 0, // timestamp
				v: item.visitCount || 0, // visit count
			};
		});

		// Build the prompt with current items
		const currentPrompt = buildAnalysisPrompt(
			itemsToAnalyze,
			currentHistoryData,
			memory,
		);
		const currentTokenCount = countTokens(currentPrompt);

		// If this would exceed the limit, use the previous iteration
		if (currentTokenCount > MAX_TOKENS && i > 5) {
			console.log(
				`Stopping at ${itemsToAnalyze.length} items (${tokenCount} tokens) to stay under limit`,
			);
			break;
		}

		// Update for next iteration
		prompt = currentPrompt;
		tokenCount = currentTokenCount;

		// Don't add more items if we're already at the end
		if (i < items.length) {
			itemsToAnalyze = items.slice(0, Math.min(i + 5, items.length));
		}
	}

	// Log if we had to limit items
	if (itemsToAnalyze.length < items.length) {
		console.warn(
			`Token limit: analyzing ${itemsToAnalyze.length} of ${items.length} items (${tokenCount} tokens)`,
		);
	}

	const session = await createChromeAISession(
		customSystemPrompt || DEFAULT_SYSTEM_PROMPT,
	);

	if (!session) {
		throw new Error(
			"Chrome AI is not available. Please use Chrome 131+ with AI features enabled.",
		);
	}

	try {
		const response = await retryWithBackoff(
			async () => {
				// Check abort before making request
				if (abortSignal?.aborted) {
					throw new Error("Analysis cancelled");
				}
				return await session.prompt(prompt, {
					responseConstraint: ANALYSIS_SCHEMA,
				});
			},
			3,
			2000,
			onProgress,
			abortSignal,
		);

		try {
			const parsed = JSON.parse(response);

			// Ensure patterns is an array and userProfile exists
			if (!parsed || !Array.isArray(parsed.patterns) || !parsed.userProfile) {
				// Chrome AI analysis response missing required fields
				return {
					patterns: [],
					userProfile: memory.userProfile,
				};
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

			// Log if limits were exceeded
			if (memory.totalItemsAnalyzed > 0) {
				if (parsed.patterns?.length > 15) {
					console.warn(
						`AI returned ${parsed.patterns.length} patterns, limiting to 15`,
					);
				}
				if (parsed.userProfile.interests?.length > 10) {
					console.warn(
						`AI returned ${parsed.userProfile.interests.length} interests, limiting to 10`,
					);
				}
			}

			return {
				patterns: validatedPatterns,
				userProfile: validatedProfile,
			};
		} catch (_error) {
			// Failed to parse Chrome AI analysis response
			return {
				patterns: [],
				userProfile: memory.userProfile,
			};
		}
	} finally {
		session.destroy();
	}
}
