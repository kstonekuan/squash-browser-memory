/// <reference types="@types/dom-chromium-ai" />

import { format } from "date-fns";
import type {
	AnalysisMemory,
	ChunkInfo,
	FullAnalysisResult,
	HistoryStats,
	MemoryData,
	UserProfile,
	WorkflowPattern,
} from "../types";
import type { AIProviderConfig } from "./ai-interface";
import { getProvider } from "./ai-provider-factory";
import { getInitializedProvider, promptAI } from "./ai-provider-utils";
import { createHistoryChunks, identifyChunks } from "./chunking";
import {
	ANALYSIS_SYSTEM_PROMPT,
	ANALYSIS_SYSTEM_PROMPT_NO_PATTERNS,
	buildAnalysisPrompt,
	buildMergePrompt,
	MERGE_SYSTEM_PROMPT,
} from "./constants";
import { createEmptyMemory } from "./memory";
import { loadMemorySettings } from "./memory-settings";
import { AnalysisResultSchema, getAnalysisSchema } from "./schemas";
import {
	calculateOptimalChunkSize,
	extractJSONFromResponse,
	getMostRecentTimestamp,
	parseHistoryItemUrl,
} from "./shared-utils";

// Re-export clearMemory for use in UI
export { clearMemoryFromStorage as clearMemory } from "./memory";

// Calculate statistics from Chrome history items
export function calculateStats(
	items: chrome.history.HistoryItem[],
): HistoryStats {
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
	phase: "calculating" | "chunking" | "analyzing" | "complete" | "error";
	currentChunk?: number;
	totalChunks?: number;
	chunkDescription?: string;
	subPhase?: "sending-analysis" | "sending-merge" | "processing";
	chunkProgress?: {
		current: number;
		total: number;
		description: string;
	};
}) => void;

// Custom prompts interface
interface CustomPrompts {
	systemPrompt?: string;
	chunkPrompt?: string;
	mergePrompt?: string;
}

// Analyze Chrome history items with memory and chunking
export async function analyzeHistoryItems(
	items: chrome.history.HistoryItem[],
	memory: AnalysisMemory | null,
	aiConfig: AIProviderConfig,
	customPrompts?: CustomPrompts,
	onProgress?: ProgressCallback,
	_trigger: "manual" | "alarm" = "manual",
	abortSignal?: AbortSignal,
	memorySettingsOverride?: { storeWorkflowPatterns: boolean },
): Promise<FullAnalysisResult> {
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
			chunkProgress: {
				current: 0,
				total: 0,
				description: `Processing ${items.length} history items`,
			},
		});
	const stats = calculateStats(items);

	// Load memory settings to check if pattern analysis is enabled
	const memorySettings = memorySettingsOverride || (await loadMemorySettings());
	const shouldAnalyzePatterns = memorySettings.storeWorkflowPatterns;

	// Use provided memory or create empty
	let workingMemory = memory || createEmptyMemory();
	console.log("Memory loaded, patterns found:", workingMemory.patterns.length);
	console.log("🔧 Pattern analysis enabled:", shouldAnalyzePatterns);
	console.log("🔧 Memory settings:", memorySettings);

	// Check if aborted before chunking
	if (abortSignal?.aborted) {
		throw new Error("Analysis cancelled");
	}

	// Identify chunks using AI
	console.log("Starting chunking phase");
	if (onProgress) {
		console.log("[Analyzer] Reporting chunking phase start");
		onProgress({
			phase: "chunking",
			chunkProgress: {
				current: 0,
				total: 0,
				description: `Analyzing ${items.length} items for time patterns`,
			},
		});
	}
	const chunkingResult = await identifyChunks(
		items,
		aiConfig,
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
		console.log(
			"[Analyzer] Reporting chunking complete with",
			chunks.length,
			"sessions",
		);
		onProgress({
			phase: "chunking",
			chunkProgress: {
				current: 0,
				total: chunks.length,
				description: `Identified ${chunks.length} browsing sessions`,
			},
		});
	}

	if (chunks.length === 0) {
		return {
			stats,
			chunks: [],
			chunkingResult,
			memory: workingMemory,
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
				? `${format(chunk.startTime, "PP")} ${format(chunk.startTime, "a")} (Fallback)`
				: timeRange?.description || `Session ${index + 1}`,
			isFallback: chunk.isFallback,
		};
	});

	// Small delay to ensure UI updates
	await new Promise((resolve) => setTimeout(resolve, 500));

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
			console.log(
				`[Analyzer] Reporting chunk ${processedChunks}/${totalChunks} progress`,
			);
			onProgress({
				phase: "analyzing",
				chunkProgress: {
					current: processedChunks,
					total: totalChunks,
					description: `${chunk.items.length} items from ${new Date(chunk.startTime).toLocaleDateString()} - ${new Date(chunk.endTime).toLocaleDateString()}`,
				},
			});
		}

		try {
			console.log(
				`Processing chunk ${i + 1}/${totalChunks} with ${chunk.items.length} items`,
			);
			// Analyze this chunk - if it's too large, subdivide it
			const { results } = await analyzeChunkWithSubdivision(
				chunk.items,
				workingMemory,
				aiConfig,
				customPrompts,
				onProgress,
				abortSignal,
				processedChunks,
				totalChunks,
				shouldAnalyzePatterns,
			);

			// Update working memory with merged results
			if (results) {
				// Find the most recent timestamp in this chunk
				const mostRecentInChunk = getMostRecentTimestamp(chunk.items);

				workingMemory = {
					userProfile: results.userProfile,
					patterns: shouldAnalyzePatterns ? results.patterns : [],
					lastAnalyzedDate: new Date(),
					lastHistoryTimestamp: Math.max(
						workingMemory.lastHistoryTimestamp,
						mostRecentInChunk,
					),
					version: workingMemory.version,
				};

				// Log memory state after chunk
				console.log(`[Analyzer] Memory updated after chunk ${i + 1}:`, {
					patterns: workingMemory.patterns.length,
					userProfile: {
						coreIdentities:
							workingMemory.userProfile.stableTraits?.coreIdentities?.length ||
							0,
						currentTasks:
							workingMemory.userProfile.dynamicContext?.currentTasks?.length ||
							0,
					},
				});
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
						workingMemory.patterns.length,
						"patterns",
					);
					console.error("- This was chunk", i + 1, "of", totalChunks);
				}
			}

			// Continue with next chunk even if one fails
		}
	}

	// Update final timestamp
	workingMemory.lastAnalyzedDate = new Date();
	console.log("Final memory state with completion timestamp");

	// Return final results from memory
	const analysisEndTime = performance.now();
	const totalDuration = ((analysisEndTime - analysisStartTime) / 1000).toFixed(
		2,
	);
	console.log(`\n=== Analysis Complete ===`);
	console.log(`Total time: ${totalDuration}s`);
	console.log(`Items analyzed: ${stats.totalUrls}`);
	console.log(`Chunks processed: ${processedChunks}`);
	console.log(`Patterns found: ${workingMemory.patterns.length}`);
	console.log(
		`Last analyzed: ${format(workingMemory.lastAnalyzedDate, "yyyy-MM-dd'T'HH:mm:ss'Z'")}`,
	);
	console.log(`========================\n`);

	return {
		stats: stats,
		chunks: chunkInfos,
		chunkingResult: chunkingResult,
		memory: workingMemory,
	};
}

// Merge new analysis results with existing results using LLM
async function mergeAnalysisResults(
	memory: AnalysisMemory,
	newResults: MemoryData,
	aiConfig: AIProviderConfig,
	customSystemPrompt?: string,
	abortSignal?: AbortSignal,
	onProgress?: ProgressCallback,
	shouldAnalyzePatterns: boolean = true,
): Promise<MemoryData> {
	// Check if aborted
	if (abortSignal?.aborted) {
		throw new Error("Analysis cancelled");
	}

	// If memory is empty (no patterns), just return the new results
	if (
		memory.patterns.length === 0 &&
		memory.userProfile.stableTraits.coreIdentities.length === 0
	) {
		return newResults;
	}

	const mergePrompt = buildMergePrompt(
		{
			userProfile: memory.userProfile,
			patterns: memory.patterns,
		},
		newResults,
		shouldAnalyzePatterns,
	);

	// Log merge info without full prompt
	console.log("\n=== Starting Merge ===");
	console.log("Merging analysis results:", {
		promptLength: mergePrompt.length,
		existingPatterns: memory.patterns.length,
		newPatterns: newResults.patterns.length,
	});

	const provider = await getInitializedProvider(
		aiConfig,
		customSystemPrompt || MERGE_SYSTEM_PROMPT,
	);

	if (!provider) {
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
		const response = await promptAI(provider, mergePrompt, {
			responseConstraint: getAnalysisSchema(shouldAnalyzePatterns),
			signal: abortSignal,
		});
		const endTime = performance.now();
		const duration = ((endTime - startTime) / 1000).toFixed(2);

		console.log(`Merge LLM call completed in ${duration}s`);
		console.log(`Merge LLM call completed in ${duration}s`);
		console.log("Merge response received:", {
			responseLength: response.length,
		});
		console.log("=== Merge Complete ===");

		// Notify that merge is complete
		if (onProgress) {
			onProgress({
				phase: "analyzing",
				subPhase: "processing",
				chunkDescription: `Processing merge results (${duration}s)`,
			});
		}

		try {
			// Clean the response to extract JSON from markdown if needed
			const cleanedResponse = extractJSONFromResponse(response);
			console.log("[Merge] Attempting to parse cleaned response");
			const parsed = JSON.parse(cleanedResponse);
			console.log("[Merge] Parsed object keys:", Object.keys(parsed));

			// Validate with appropriate schema based on whether patterns are enabled
			if (shouldAnalyzePatterns) {
				const validated = AnalysisResultSchema.parse(parsed);

				// Log merge results for debugging
				console.log("Merge operation:", {
					beforePatterns: memory.patterns.length,
					newPatterns: newResults.patterns.length,
					afterPatterns: validated.patterns.length,
					sampleBefore: memory.patterns.slice(0, 3).map((p) => p.description),
					sampleNew: newResults.patterns.slice(0, 3).map((p) => p.description),
					sampleAfter: validated.patterns.slice(0, 3).map((p) => p.description),
				});

				return {
					patterns: validated.patterns,
					userProfile: validated.userProfile,
				};
			} else {
				// For no-patterns schema, we only expect userProfile
				const validated = parsed as { userProfile: UserProfile };

				console.log("Merge operation (no patterns):", {
					beforePatterns: 0,
					newPatterns: 0,
					afterPatterns: 0,
				});

				return {
					patterns: [],
					userProfile: validated.userProfile,
				};
			}
		} catch (parseError) {
			console.error("Failed to parse merge response:", parseError);
			console.error("Response length:", response.length);
			console.error(
				"[Merge] First 1000 chars of raw response:",
				response.substring(0, 1000),
			);
			if (parseError instanceof Error) {
				console.error("Parse error details:", parseError.message);
				try {
					const cleaned = extractJSONFromResponse(response);
					console.error("[Merge] Cleaned response length:", cleaned.length);
					console.error(
						"[Merge] First 500 chars of cleaned:",
						cleaned.substring(0, 500),
					);
				} catch (cleanError) {
					console.error(
						"[Merge] Failed to debug cleaned response:",
						cleanError,
					);
				}
			}

			// For merge failures, return the new results as-is
			console.log("Falling back to new results without merging");
			return newResults;
		}
	} catch (error) {
		console.error("Failed to merge with memory, returning new results:", error);
		return newResults;
	} finally {
		// No cleanup needed with stateless providers
	}
}

// Analyze a chunk with automatic subdivision if it's too large
async function analyzeChunkWithSubdivision(
	items: chrome.history.HistoryItem[],
	memory: AnalysisMemory,
	aiConfig: AIProviderConfig,
	customPrompts?: CustomPrompts,
	onProgress?: ProgressCallback,
	abortSignal?: AbortSignal,
	chunkNumber?: number,
	totalChunks?: number,
	shouldAnalyzePatterns: boolean = true,
): Promise<{
	processedItems: number;
	results: { userProfile: UserProfile; patterns: WorkflowPattern[] } | null;
}> {
	// First, try to analyze the entire chunk
	try {
		// For Chrome AI, we need to use the analysis system prompt
		const analysisSystemPrompt =
			customPrompts?.systemPrompt || ANALYSIS_SYSTEM_PROMPT;

		// Build a test prompt to check token count
		const testHistoryData = items.map(parseHistoryItemUrl);

		// First, try to analyze the entire chunk
		try {
			// Step 1: Analyze the chunk
			const chunkResults = await analyzeChunk(
				items,
				aiConfig,
				customPrompts?.systemPrompt,
				onProgress,
				abortSignal,
				shouldAnalyzePatterns,
			);

			// Step 2: Merge with existing memory (skip if memory is empty)
			const mergedResults =
				memory.patterns.length === 0 &&
				memory.userProfile.stableTraits.coreIdentities.length === 0
					? chunkResults
					: await mergeAnalysisResults(
							memory,
							chunkResults,
							aiConfig,
							customPrompts?.mergePrompt || MERGE_SYSTEM_PROMPT,
							abortSignal,
							onProgress,
							shouldAnalyzePatterns,
						);

			return { processedItems: items.length, results: mergedResults };
		} catch (error) {
			// Check if it's a token limit error (QuotaExceededError)
			if (
				error instanceof DOMException &&
				error.name === "QuotaExceededError"
			) {
				// Get provider capabilities for better error messaging
				const provider = getProvider(aiConfig);
				console.log(
					`Chunk with ${items.length} items exceeds token limit for ${provider.getProviderName()}, subdividing...`,
				);
			} else {
				// Not a token limit error, re-throw
				throw error;
			}
		}

		// Need to subdivide the chunk
		console.log("Chunk too large, calculating optimal subdivision size...");

		// Get provider capabilities for optimal chunking
		const providerForCapabilities = getProvider(aiConfig);
		const capabilities = providerForCapabilities.getCapabilities();

		// Initialize provider for token measurement
		const provider = await getInitializedProvider(
			aiConfig,
			analysisSystemPrompt,
		);
		if (!provider) {
			throw new Error("AI is not available for measuring tokens.");
		}

		// Determine max tokens
		const maxTokens = capabilities.optimalChunkTokens;

		// Calculate optimal size using binary search
		const optimalSize = await calculateOptimalChunkSize(
			items,
			maxTokens,
			async (testItems) => {
				if (
					!capabilities.supportsTokenMeasurement ||
					!provider.measureInputUsage
				) {
					// Fallback to estimation
					const tokensPerItem = providerForCapabilities
						.getProviderName()
						.includes("Claude")
						? 50
						: 25;
					return testItems.length * tokensPerItem;
				}

				const testData = testHistoryData.slice(0, testItems.length);
				const testPrompt = buildAnalysisPrompt(testItems, testData);
				return await provider.measureInputUsage(testPrompt, {
					responseConstraint: getAnalysisSchema(shouldAnalyzePatterns),
					signal: abortSignal,
				});
			},
			providerForCapabilities.getProviderName().includes("Claude") ? 50 : 25,
			abortSignal,
		);

		// No cleanup needed with stateless providers
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
					chunkProgress: {
						current: chunkNumber || subChunkNum,
						total: totalChunks || totalSubChunks,
						description: `${mainChunkInfo}Processing ${subItems.length} items (sub-chunk ${subChunkNum}/${totalSubChunks})`,
					},
				});
			}

			// Step 1: Analyze sub-chunk
			const subResults = await analyzeChunk(
				subItems,
				aiConfig,
				analysisSystemPrompt,
				undefined, // Don't pass onProgress to avoid duplicate updates
				abortSignal,
				shouldAnalyzePatterns,
			);

			// Step 2: Merge with current memory (skip if current memory is from original empty memory)
			const mergedResults =
				currentMemory.patterns.length === 0 &&
				currentMemory.userProfile.stableTraits.coreIdentities.length === 0 &&
				memory.patterns.length === 0 &&
				memory.userProfile.stableTraits.coreIdentities.length === 0
					? subResults
					: await mergeAnalysisResults(
							currentMemory,
							subResults,
							aiConfig,
							customPrompts?.mergePrompt || MERGE_SYSTEM_PROMPT,
							abortSignal,
							onProgress,
							shouldAnalyzePatterns,
						);

			// Update memory with merged results
			// Find the most recent timestamp in this sub-chunk
			const mostRecentInSubChunk = getMostRecentTimestamp(subItems);

			currentMemory = {
				userProfile: mergedResults.userProfile,
				patterns: shouldAnalyzePatterns ? mergedResults.patterns : [],
				lastAnalyzedDate: new Date(),
				lastHistoryTimestamp: Math.max(
					currentMemory.lastHistoryTimestamp,
					mostRecentInSubChunk,
				),
				version: currentMemory.version,
			};

			totalProcessed += subItems.length;
		}

		return {
			processedItems: totalProcessed,
			results: {
				userProfile: currentMemory.userProfile,
				patterns: shouldAnalyzePatterns ? currentMemory.patterns : [],
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
	aiConfig: AIProviderConfig,
	customSystemPrompt?: string,
	onProgress?: ProgressCallback,
	abortSignal?: AbortSignal,
	shouldAnalyzePatterns: boolean = true,
): Promise<{ userProfile: UserProfile; patterns: WorkflowPattern[] }> {
	// Parse URLs for all items
	const historyData = items.map(parseHistoryItemUrl);

	// Build the analysis prompt
	const prompt = buildAnalysisPrompt(items, historyData);

	console.log("\n=== Starting Analysis ===");
	console.log("Analysis details:", {
		promptLength: prompt.length,
		itemCount: items.length,
		shouldAnalyzePatterns: shouldAnalyzePatterns,
	});

	const systemPrompt =
		customSystemPrompt ||
		(shouldAnalyzePatterns
			? ANALYSIS_SYSTEM_PROMPT
			: ANALYSIS_SYSTEM_PROMPT_NO_PATTERNS);

	console.log(
		"Using system prompt:",
		shouldAnalyzePatterns ? "WITH patterns" : "WITHOUT patterns",
	);
	console.log("Schema will include patterns:", shouldAnalyzePatterns);

	const provider = await getInitializedProvider(aiConfig, systemPrompt);

	if (!provider) {
		throw new Error("AI is not available.");
	}

	try {
		console.log(`Analyzing chunk with ${items.length} items`);

		// Check abort before making request
		if (abortSignal?.aborted) {
			throw new Error("Analysis cancelled");
		}
		console.log("Sending analysis prompt to AI...");

		// Notify progress that we're sending analysis prompt
		if (onProgress) {
			onProgress({
				phase: "analyzing",
				subPhase: "sending-analysis",
				chunkDescription: `Sending analysis prompt for ${items.length} items`,
			});
		}

		const startTime = performance.now();
		const response = await promptAI(provider, prompt, {
			responseConstraint: getAnalysisSchema(shouldAnalyzePatterns),
			signal: abortSignal,
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
		console.log(
			`Analysis LLM call completed in ${duration}s for ${items.length} items`,
		);
		console.log("Response received:", {
			responseLength: response.length,
		});
		console.log("=== Analysis Complete ===");

		try {
			// Clean the response to extract JSON from markdown if needed
			const cleanedResponse = extractJSONFromResponse(response);
			console.log("[Analyzer] Attempting to parse cleaned response");
			const parsed = JSON.parse(cleanedResponse);
			console.log("[Analyzer] Parsed object keys:", Object.keys(parsed));

			// Validate with appropriate schema based on whether patterns are enabled
			if (shouldAnalyzePatterns) {
				const validated = AnalysisResultSchema.parse(parsed);
				return {
					patterns: validated.patterns,
					userProfile: validated.userProfile,
				};
			} else {
				// For no-patterns schema, we only expect userProfile
				const validated = parsed as { userProfile: UserProfile };
				return {
					patterns: [],
					userProfile: validated.userProfile,
				};
			}
		} catch (error) {
			// Failed to parse AI analysis response
			console.error("Failed to parse AI response:", error);
			console.error("Raw response length:", response.length);
			console.error(
				"[Analyzer] First 1000 chars of raw response:",
				response.substring(0, 1000),
			);
			if (error instanceof Error) {
				console.error("Parse error details:", error.message);
				// Show a snippet of the cleaned response for debugging
				try {
					const cleaned = extractJSONFromResponse(response);
					console.error("Cleaned response length:", cleaned.length);
					console.error(
						"[Analyzer] First 500 chars of cleaned:",
						cleaned.substring(0, 500),
					);
					console.error(
						"[Analyzer] Last 500 chars of cleaned:",
						cleaned.substring(cleaned.length - 500),
					);
					// Log the area around the error if we can parse the position
					const posMatch = error.message.match(/position (\d+)/);
					if (posMatch) {
						const pos = parseInt(posMatch[1], 10);
						const start = Math.max(0, pos - 100);
						const end = Math.min(cleaned.length, pos + 100);
						console.error(
							`JSON around error position ${pos}:`,
							cleaned.substring(start, end),
						);
					}
				} catch (cleanError) {
					console.error("Failed to debug cleaned response:", cleanError);
				}
			}

			// Let the error propagate - no complex recovery
			throw error;
		}
	} finally {
		// No cleanup needed with stateless providers
	}
}
