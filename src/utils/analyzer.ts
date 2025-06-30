import type {
	AnalysisResult,
	ChunkInfo,
	UserProfile,
	WorkflowPattern,
} from "../types";
import { loadAIConfig } from "./ai-config";
import { getProvider } from "./ai-provider-factory";
import { createAISession, promptAI } from "./ai-session-factory";
import { createHistoryChunks, identifyChunks } from "./chunking";
import {
	buildAnalysisPrompt,
	buildMergePrompt,
	DEFAULT_SYSTEM_PROMPT,
} from "./constants";
import { saveMemoryWithEmbeddings } from "./embeddings-memory";
import { type AnalysisMemory, createEmptyMemory, loadMemory } from "./memory";
import { ANALYSIS_SCHEMA } from "./schemas";

// Re-export clearMemory for use in UI
export { clearMemory } from "./memory";

// Export for testing
export { hideTrackingParams };

// Helper function to extract JSON from markdown-wrapped responses
function extractJSONFromResponse(response: string): string {
	// Remove markdown code fences if present
	const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
	const match = response.match(codeBlockRegex);

	if (match) {
		console.log("Found markdown-wrapped JSON, extracting...");
		return match[1].trim();
	}

	// If no code blocks, try to find JSON object boundaries
	const jsonStartIndex = response.indexOf("{");
	const jsonEndIndex = response.lastIndexOf("}");

	if (
		jsonStartIndex !== -1 &&
		jsonEndIndex !== -1 &&
		jsonEndIndex > jsonStartIndex
	) {
		const extractedJson = response.substring(jsonStartIndex, jsonEndIndex + 1);
		if (extractedJson !== response.trim()) {
			console.log("Extracted JSON from mixed content response");
		}
		return extractedJson;
	}

	// Return as-is if no extraction needed
	return response.trim();
}

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
	subPhase?: "sending-analysis" | "sending-merge" | "processing";
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
	const analysisStartTime = performance.now();

	// Check if already aborted
	if (abortSignal?.aborted) {
		throw new Error("Analysis cancelled");
	}

	// Notify that we're calculating statistics
	console.log("Starting analysis with", items.length, "items");
	if (onProgress)
		onProgress({
			phase: "calculating",
			chunkDescription: `Processing ${items.length} history items`,
		});
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
	console.log("Starting chunking phase");
	if (onProgress)
		onProgress({
			phase: "chunking",
			chunkDescription: `Analyzing ${items.length} items for time patterns`,
		});
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
	if (onProgress && chunks.length > 0) {
		onProgress({
			phase: "chunking",
			chunkDescription: `Identified ${chunks.length} browsing sessions`,
		});
	}

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
				chunkDescription: `${chunk.items.length} items from ${chunk.startTime.toLocaleDateString()} - ${chunk.endTime.toLocaleDateString()}`,
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
				// Find the most recent timestamp in this chunk
				const chunkTimestamps = chunk.items
					.map((item) => item.lastVisitTime || 0)
					.filter((time) => time > 0);
				const mostRecentInChunk =
					chunkTimestamps.length > 0 ? Math.max(...chunkTimestamps) : 0;

				memory = {
					userProfile: results.userProfile,
					patterns: results.patterns,
					lastAnalyzedDate: new Date(),
					lastHistoryTimestamp: Math.max(
						memory.lastHistoryTimestamp,
						mostRecentInChunk,
					),
					totalItemsAnalyzed: memory.totalItemsAnalyzed + processedItems,
					version: memory.version,
				};

				// Save memory after each chunk
				await saveMemoryWithEmbeddings(memory);
			}

			// Small delay between chunks to avoid quota issues
			if (i < chunks.length - 1) {
				await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay
			}
		} catch (error) {
			console.error(`Failed to analyze chunk ${i + 1}:`, error);

			// If it's an UnknownError, provide more context
			if (error instanceof Error) {
				if (
					error.name === "UnknownError" ||
					error.message.includes("UnknownError")
				) {
					console.error("Additional context for UnknownError:");
					console.error("- Chunk had", chunk.items.length, "items");
					console.error(
						"- Memory has",
						memory.totalItemsAnalyzed,
						"previously analyzed items",
					);
					console.error("- This was chunk", i + 1, "of", totalChunks);
				}
			}

			// Continue with next chunk even if one fails
		}
	}

	// Final save with completion timestamp
	memory.lastAnalyzedDate = new Date();
	await saveMemoryWithEmbeddings(memory);
	console.log("Final memory saved with completion timestamp");

	// Return final results from memory
	const analysisEndTime = performance.now();
	const totalDuration = ((analysisEndTime - analysisStartTime) / 1000).toFixed(
		2,
	);
	console.log(`\n=== Analysis Complete ===`);
	console.log(`Total time: ${totalDuration}s`);
	console.log(`Items analyzed: ${stats.totalUrls}`);
	console.log(`Chunks processed: ${processedChunks}`);
	console.log(`Patterns found: ${memory.patterns.length}`);
	console.log(`Last analyzed: ${memory.lastAnalyzedDate.toISOString()}`);
	console.log(`========================\n`);

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
			const isLastAttempt = i === maxRetries - 1;

			// Only retry on quota errors, not on other errors
			if (
				!(
					error instanceof DOMException && error.name === "QuotaExceededError"
				) ||
				isLastAttempt
			) {
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
	onProgress?: ProgressCallback,
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

	const session = await createAISession(
		customSystemPrompt || DEFAULT_SYSTEM_PROMPT,
	);

	if (!session) {
		throw new Error("AI is not available for merging.");
	}

	try {
		console.log("Sending merge prompt to AI...");

		// Notify progress that we're sending merge prompt
		if (onProgress) {
			onProgress({
				phase: "analyzing",
				subPhase: "sending-merge",
				chunkDescription: `Merging ${newResults.patterns.length} new patterns with ${memory.patterns.length} existing patterns`,
			});
		}

		const startTime = performance.now();
		const response = await promptAI(session, mergePrompt, {
			responseConstraint: ANALYSIS_SCHEMA,
		});
		const endTime = performance.now();
		const duration = ((endTime - startTime) / 1000).toFixed(2);

		console.log(`Merge LLM call completed in ${duration}s`);
		console.log("Merge response received");

		// Notify that merge is complete
		if (onProgress) {
			onProgress({
				phase: "analyzing",
				subPhase: "processing",
				chunkDescription: `Processing merge results (${duration}s)`,
			});
		}

		let parsed: { userProfile: UserProfile; patterns: WorkflowPattern[] };
		try {
			// Clean the response to extract JSON from markdown if needed
			const cleanedResponse = extractJSONFromResponse(response);
			parsed = JSON.parse(cleanedResponse);
		} catch (parseError) {
			console.error("Failed to parse merge response:", parseError);
			console.error("Response length:", response.length);
			console.error("Response preview:", `${response.substring(0, 200)}...`);

			// For merge failures, return the new results as-is
			console.log("Falling back to new results without merging");
			return newResults;
		}

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
			currentGoals: parsed.userProfile.currentGoals?.slice(0, 6) || [],
			recentObsessions: parsed.userProfile.recentObsessions?.slice(0, 5) || [],
			lifecycleHints: parsed.userProfile.lifecycleHints?.slice(0, 4) || [],
			personalPreferences:
				parsed.userProfile.personalPreferences?.slice(0, 8) || [],
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

		// First, try to analyze the entire chunk
		try {
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
							onProgress,
						);

			return { processedItems: items.length, results: mergedResults };
		} catch (error) {
			// Check if it's a token limit error (QuotaExceededError)
			if (
				error instanceof DOMException &&
				error.name === "QuotaExceededError"
			) {
				// Get provider capabilities for better error messaging
				const config = await loadAIConfig();
				const provider = getProvider(config);
				console.log(
					`Chunk with ${items.length} items exceeds token limit for ${provider.getProviderName()}, subdividing...`,
				);
			} else {
				// Not a token limit error, re-throw
				throw error;
			}
		}

		// Need to subdivide the chunk

		// Binary search for the right size using the AI API
		const session = await createAISession(
			customSystemPrompt || DEFAULT_SYSTEM_PROMPT,
		);

		if (!session) {
			throw new Error("AI is not available for measuring tokens.");
		}

		// Get provider capabilities for optimal chunking
		const config = await loadAIConfig();
		const provider = getProvider(config);
		const capabilities = provider.getCapabilities();

		let left = 1;
		let right = items.length;
		let optimalSize = 1; // Start with minimum of 1 item

		try {
			while (left <= right) {
				const mid = Math.floor((left + right) / 2);
				const testItems = items.slice(0, mid);
				const testData = testHistoryData.slice(0, mid);
				const testPrompt = buildAnalysisPrompt(testItems, testData);

				try {
					if (
						capabilities.supportsTokenMeasurement &&
						session.measureInputUsage
					) {
						const testTokenCount = await session.measureInputUsage(testPrompt, {
							responseConstraint: ANALYSIS_SCHEMA,
						});
						console.log(
							`Testing ${mid} items: ${testTokenCount} tokens (${provider.getProviderName()})`,
						);

						// Use provider-specific token limit
						if (testTokenCount <= capabilities.optimalChunkTokens) {
							optimalSize = mid;
							left = mid + 1;
						} else {
							right = mid - 1;
						}
					} else {
						// If provider doesn't support token measurement, use a conservative approach
						// For Claude: estimate ~4 chars per token, ~50 tokens per item average
						// For others: use very conservative estimate
						const tokensPerItem = provider.getProviderName().includes("Claude")
							? 50
							: 25;
						const estimatedTokens = mid * tokensPerItem;

						console.log(
							`Estimating ${mid} items = ${estimatedTokens} tokens (${provider.getProviderName()})`,
						);

						if (estimatedTokens <= capabilities.optimalChunkTokens) {
							optimalSize = mid;
							left = mid + 1;
						} else {
							right = mid - 1;
						}
					}
				} catch {
					// If measurement fails, assume it's too large
					console.log(
						`Measurement failed for ${mid} items, assuming too large`,
					);
					right = mid - 1;
				}
			}

			console.log(
				`Optimal subdivision size: ${optimalSize} items per sub-chunk`,
			);
		} finally {
			session.destroy();
		}

		// Process in sub-chunks
		let currentMemory = memory;
		let totalProcessed = 0;

		for (let i = 0; i < items.length; i += optimalSize) {
			// Check if aborted before processing sub-chunk
			if (abortSignal?.aborted) {
				throw new Error("Analysis cancelled");
			}

			const subItems = items.slice(i, i + optimalSize);
			console.log(
				`Processing sub-chunk starting at index ${i}, ${subItems.length} items`,
			);

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
					chunkDescription: `${mainChunkInfo}Processing ${subItems.length} items (sub-chunk ${subChunkNum}/${totalSubChunks})`,
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
							onProgress,
						);

			// Update memory with merged results
			// Find the most recent timestamp in this sub-chunk
			const subChunkTimestamps = subItems
				.map((item) => item.lastVisitTime || 0)
				.filter((time) => time > 0);
			const mostRecentInSubChunk =
				subChunkTimestamps.length > 0 ? Math.max(...subChunkTimestamps) : 0;

			currentMemory = {
				userProfile: mergedResults.userProfile,
				patterns: mergedResults.patterns,
				lastAnalyzedDate: new Date(),
				lastHistoryTimestamp: Math.max(
					currentMemory.lastHistoryTimestamp,
					mostRecentInSubChunk,
				),
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

	const session = await createAISession(
		customSystemPrompt || DEFAULT_SYSTEM_PROMPT,
	);

	if (!session) {
		throw new Error("AI is not available.");
	}

	try {
		console.log(`Analyzing chunk with ${items.length} items`);
		const response = await retryWithBackoff(
			async () => {
				// Check abort before making request
				if (abortSignal?.aborted) {
					throw new Error("Analysis cancelled");
				}
				console.log("Sending analysis prompt to AI...");
				console.log(
					"Prompt preview (first 200 chars):",
					`${prompt.substring(0, 200)}...`,
				);
				console.log(
					"Using response schema:",
					`${JSON.stringify(ANALYSIS_SCHEMA).substring(0, 100)}...`,
				);

				// Notify progress that we're sending analysis prompt
				if (onProgress) {
					onProgress({
						phase: "analyzing",
						subPhase: "sending-analysis",
						chunkDescription: `Sending analysis prompt for ${items.length} items`,
					});
				}

				const startTime = performance.now();
				const result = await promptAI(session, prompt, {
					responseConstraint: ANALYSIS_SCHEMA,
				});
				const endTime = performance.now();
				const duration = ((endTime - startTime) / 1000).toFixed(2);

				console.log(
					`Analysis LLM call completed in ${duration}s for ${items.length} items`,
				);

				// Notify that we received response
				if (onProgress) {
					onProgress({
						phase: "analyzing",
						subPhase: "processing",
						chunkDescription: `Processing AI response (${duration}s)`,
					});
				}

				return result;
			},
			3,
			2000,
			onProgress,
			abortSignal,
		);
		console.log("Analysis response received");

		try {
			// Clean the response to extract JSON from markdown if needed
			const cleanedResponse = extractJSONFromResponse(response);
			const parsed = JSON.parse(cleanedResponse);

			// Ensure patterns is an array and userProfile exists
			if (!parsed || !Array.isArray(parsed.patterns) || !parsed.userProfile) {
				// Chrome AI analysis response missing required fields
				throw new Error("AI response missing required fields");
			}

			// Validate and enforce limits
			const validatedProfile = {
				...parsed.userProfile,
				interests: parsed.userProfile.interests?.slice(0, 10) || [],
				currentGoals: parsed.userProfile.currentGoals?.slice(0, 6) || [],
				recentObsessions:
					parsed.userProfile.recentObsessions?.slice(0, 5) || [],
				lifecycleHints: parsed.userProfile.lifecycleHints?.slice(0, 4) || [],
				personalPreferences:
					parsed.userProfile.personalPreferences?.slice(0, 8) || [],
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
			// Failed to parse AI analysis response
			console.error("Failed to parse AI response:", error);
			console.error("Raw response length:", response.length);
			console.error("Response preview:", `${response.substring(0, 200)}...`);
			console.error(
				"Response end:",
				`...${response.substring(Math.max(0, response.length - 200))}`,
			);

			// Try to show what the cleaning function extracted
			try {
				const cleaned = extractJSONFromResponse(response);
				console.error(
					"Cleaned response preview:",
					`${cleaned.substring(0, 200)}...`,
				);
			} catch (cleanError) {
				console.error("Failed to clean response:", cleanError);
			}
			console.error(
				"Response end:",
				`...${response.substring(response.length - 200)}`,
			);

			// Try to salvage the response by finding the last complete JSON object
			if (
				error instanceof SyntaxError &&
				error.message.includes("Unterminated string")
			) {
				console.log("Attempting to salvage truncated JSON response...");

				// Try to find the last complete object by looking for closing braces
				let lastValidIndex = response.length;
				let braceCount = 0;
				let inString = false;
				let escapeNext = false;

				for (let i = 0; i < response.length; i++) {
					const char = response[i];

					if (escapeNext) {
						escapeNext = false;
						continue;
					}

					if (char === "\\") {
						escapeNext = true;
						continue;
					}

					if (char === '"' && !escapeNext) {
						inString = !inString;
						continue;
					}

					if (!inString) {
						if (char === "{") braceCount++;
						else if (char === "}") {
							braceCount--;
							if (braceCount === 0) {
								lastValidIndex = i + 1;
							}
						}
					}
				}

				if (lastValidIndex < response.length && lastValidIndex > 100) {
					const truncatedResponse = response.substring(0, lastValidIndex);
					console.log(
						"Attempting to parse truncated response at index",
						lastValidIndex,
					);

					try {
						const salvaged = JSON.parse(truncatedResponse);
						console.log("Successfully salvaged truncated response!");

						// Return with default patterns if needed
						return {
							patterns: salvaged.patterns || [],
							userProfile: salvaged.userProfile || {
								profession: "Unknown",
								interests: [],
								workPatterns: [],
								personalityTraits: [],
								technologyUse: [],
								summary:
									"Analysis was partially completed due to response truncation.",
							},
						};
					} catch (salvageError) {
						console.error(
							"Failed to salvage truncated response:",
							salvageError,
						);
					}
				}
			}

			throw error;
		}
	} finally {
		session.destroy();
	}
}
