/// <reference types="@types/dom-chromium-ai" />

import { format } from "date-fns";
import type {
	AnalysisMemory,
	ChunkInfo,
	CustomPrompts,
	FullAnalysisResult,
	HistoryStats,
	MemoryData,
	UserProfile,
	WorkflowPattern,
} from "../types";
import type { AIProviderConfig } from "./ai-interface";
import { createProvider } from "./ai-provider-factory";
import { getInitializedProvider, promptAI } from "./ai-provider-utils";
import { createHistoryChunks, identifyChunks } from "./chunking";
import {
	buildAnalysisPrompt,
	buildMergePrompt,
	MERGE_SYSTEM_PROMPT,
	USER_PROFILE_SYSTEM_PROMPT,
	WORKFLOW_PATTERNS_SYSTEM_PROMPT,
} from "./constants";
import { createEmptyMemory } from "./memory";
import { loadMemorySettings } from "./memory-settings";
import {
	ANALYSIS_SCHEMA,
	USER_PROFILE_SCHEMA,
	UserProfileSchema,
	WORKFLOW_PATTERNS_ONLY_SCHEMA,
	WorkflowPatternsOnlySchema,
} from "./schemas";
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

// Analyze Chrome history items with memory and chunking
export async function analyzeHistoryItems(
	items: chrome.history.HistoryItem[],
	memory: AnalysisMemory | null,
	aiConfig: AIProviderConfig,
	customPrompts?: CustomPrompts,
	onProgress?: ProgressCallback,
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

// Generic merge function to handle both user profiles and workflow patterns
async function mergeWithAI<T>(
	mergeType: "userProfile" | "patterns",
	existing: T,
	newData: T,
	aiConfig: AIProviderConfig,
	responseConstraint: Record<string, unknown>,
	parseResponse: (parsed: unknown) => T,
	customSystemPrompt?: string,
	abortSignal?: AbortSignal,
	onProgress?: ProgressCallback,
	mergeDetails?: {
		existingCount: number;
		newCount: number;
		description: string;
	},
): Promise<T> {
	// Check if aborted
	if (abortSignal?.aborted) {
		throw new Error("Analysis cancelled");
	}

	// Build merge prompt based on type
	let mergePrompt: string;
	if (mergeType === "userProfile") {
		mergePrompt = buildMergePrompt(
			{ userProfile: existing as UserProfile, patterns: [] },
			{ userProfile: newData as UserProfile, patterns: [] },
			false,
		);
	} else {
		// For patterns, we need to create empty profile
		const emptyProfile: UserProfile = {
			stableTraits: { coreIdentities: [], personalPreferences: [] },
			dynamicContext: { currentTasks: [], currentInterests: [] },
			summary: "",
		};
		mergePrompt = buildMergePrompt(
			{ userProfile: emptyProfile, patterns: existing as WorkflowPattern[] },
			{ userProfile: emptyProfile, patterns: newData as WorkflowPattern[] },
			true,
		);
	}

	const typeName =
		mergeType === "userProfile" ? "User Profile" : "Workflow Patterns";
	console.log(`\n=== Starting ${typeName} Merge ===`);
	if (mergeDetails) {
		console.log(`Merging ${mergeType}:`, {
			promptLength: mergePrompt.length,
			existingCount: mergeDetails.existingCount,
			newCount: mergeDetails.newCount,
		});
	}

	const provider = await getInitializedProvider(
		aiConfig,
		customSystemPrompt || MERGE_SYSTEM_PROMPT,
	);

	if (!provider) {
		throw new Error("AI is not available for merging.");
	}

	try {
		console.log(`Sending ${mergeType} merge prompt to AI...`);

		// Notify progress that we're sending merge prompt
		if (onProgress) {
			onProgress({
				phase: "analyzing",
				subPhase: "sending-merge",
				chunkDescription: mergeDetails?.description || `Merging ${mergeType}`,
			});
		}

		const startTime = performance.now();
		const response = await promptAI(provider, mergePrompt, {
			responseConstraint: responseConstraint,
			signal: abortSignal,
		});
		const endTime = performance.now();
		const duration = ((endTime - startTime) / 1000).toFixed(2);

		console.log(`${typeName} merge completed in ${duration}s`);
		console.log(`=== ${typeName} Merge Complete ===`);

		// Notify that merge is complete
		if (onProgress) {
			onProgress({
				phase: "analyzing",
				subPhase: "processing",
				chunkDescription: `Processing ${mergeType} merge results (${duration}s)`,
			});
		}

		try {
			// Clean the response to extract JSON from markdown if needed
			const cleanedResponse = extractJSONFromResponse(response);
			console.log(`[${typeName}Merge] Attempting to parse cleaned response`);
			const parsed = JSON.parse(cleanedResponse);
			console.log(
				`[${typeName}Merge] Parsed object keys:`,
				Object.keys(parsed),
			);

			const validated = parseResponse(parsed);
			return validated;
		} catch (parseError) {
			console.error(`Failed to parse ${mergeType} merge response:`, parseError);
			console.error("Response length:", response.length);
			throw parseError;
		}
	} catch (error) {
		console.error(`Failed to merge ${mergeType}:`, error);
		throw error;
	}
}

// Merge user profiles using LLM
async function mergeUserProfiles(
	existingProfile: UserProfile,
	newProfile: UserProfile,
	aiConfig: AIProviderConfig,
	customSystemPrompt?: string,
	abortSignal?: AbortSignal,
	onProgress?: ProgressCallback,
): Promise<UserProfile> {
	// If existing profile is empty, just return the new profile
	if (
		existingProfile.stableTraits.coreIdentities.length === 0 &&
		existingProfile.stableTraits.personalPreferences.length === 0 &&
		existingProfile.dynamicContext.currentTasks.length === 0 &&
		existingProfile.dynamicContext.currentInterests.length === 0
	) {
		return newProfile;
	}

	try {
		return await mergeWithAI(
			"userProfile",
			existingProfile,
			newProfile,
			aiConfig,
			USER_PROFILE_SCHEMA,
			UserProfileSchema.parse,
			customSystemPrompt,
			abortSignal,
			onProgress,
			{
				existingCount: existingProfile.stableTraits.coreIdentities.length,
				newCount: newProfile.stableTraits.coreIdentities.length,
				description: "Merging user profiles",
			},
		);
	} catch (error) {
		console.error("Falling back to new profile without merging", error);
		return newProfile;
	}
}

// Merge workflow patterns using LLM
async function mergeWorkflowPatterns(
	existingPatterns: WorkflowPattern[],
	newPatterns: WorkflowPattern[],
	aiConfig: AIProviderConfig,
	customSystemPrompt?: string,
	abortSignal?: AbortSignal,
	onProgress?: ProgressCallback,
): Promise<WorkflowPattern[]> {
	// If no existing patterns, just return the new patterns
	if (existingPatterns.length === 0) {
		return newPatterns;
	}

	// If no new patterns, return existing patterns
	if (newPatterns.length === 0) {
		return existingPatterns;
	}

	try {
		return await mergeWithAI(
			"patterns",
			existingPatterns,
			newPatterns,
			aiConfig,
			WORKFLOW_PATTERNS_ONLY_SCHEMA,
			WorkflowPatternsOnlySchema.parse,
			customSystemPrompt,
			abortSignal,
			onProgress,
			{
				existingCount: existingPatterns.length,
				newCount: newPatterns.length,
				description: `Merging ${newPatterns.length} new patterns with ${existingPatterns.length} existing patterns`,
			},
		);
	} catch (error) {
		console.error(
			"Falling back to concatenating patterns without merging",
			error,
		);
		return [...existingPatterns, ...newPatterns];
	}
}

// Merge new analysis results with existing results using separate LLM calls
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

	// If memory is empty (no patterns and no profile), just return the new results
	if (
		memory.patterns.length === 0 &&
		memory.userProfile.stableTraits.coreIdentities.length === 0
	) {
		return newResults;
	}

	console.log("\n=== Starting Separate Merge Operations ===");
	console.log("Merge configuration:", {
		hasExistingProfile:
			memory.userProfile.stableTraits.coreIdentities.length > 0,
		hasNewProfile:
			newResults.userProfile.stableTraits.coreIdentities.length > 0,
		hasExistingPatterns: memory.patterns.length > 0,
		hasNewPatterns: newResults.patterns.length > 0,
		shouldAnalyzePatterns: shouldAnalyzePatterns,
	});

	try {
		// Step 1: Merge user profiles
		console.log("Step 1: Merging user profiles...");
		const mergedUserProfile = await mergeUserProfiles(
			memory.userProfile,
			newResults.userProfile,
			aiConfig,
			customSystemPrompt,
			abortSignal,
			onProgress,
		);

		// Step 2: Merge workflow patterns (if enabled)
		let mergedPatterns: WorkflowPattern[] = [];
		if (shouldAnalyzePatterns) {
			console.log("Step 2: Merging workflow patterns...");
			mergedPatterns = await mergeWorkflowPatterns(
				memory.patterns,
				newResults.patterns,
				aiConfig,
				customSystemPrompt,
				abortSignal,
				onProgress,
			);
		} else {
			console.log("Step 2: Skipping workflow patterns merge (disabled)");
		}

		console.log("=== Separate Merge Operations Complete ===");
		console.log("Merge results:", {
			userProfile: {
				coreIdentities: mergedUserProfile.stableTraits.coreIdentities.length,
				currentTasks: mergedUserProfile.dynamicContext.currentTasks.length,
			},
			patterns: mergedPatterns.length,
		});

		return {
			userProfile: mergedUserProfile,
			patterns: mergedPatterns,
		};
	} catch (error) {
		console.error("Failed to merge analysis results:", error);
		// For any merge failures, return the new results as-is
		console.log("Falling back to new results without merging");
		return newResults;
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
		// Build a test prompt to check token count
		const testHistoryData = items.map(parseHistoryItemUrl);

		// First, try to analyze the entire chunk
		try {
			// Step 1: Analyze the chunk
			const chunkResults = await analyzeChunk(
				items,
				aiConfig,
				customPrompts,
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
				const provider = createProvider(aiConfig);
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
		const providerForCapabilities = createProvider(aiConfig);
		const capabilities = providerForCapabilities.getCapabilities();

		// Initialize provider for token measurement
		const provider = await getInitializedProvider(
			aiConfig,
			customPrompts?.userProfilePrompt || USER_PROFILE_SYSTEM_PROMPT,
		);
		if (!provider) {
			throw new Error("AI is not available for measuring tokens.");
		}

		// Determine max tokens
		const maxTokens = capabilities.optimalChunkTokens;

		// Fallback to estimation
		const providerName = providerForCapabilities.getProviderName();
		const tokensPerItem =
			providerName.includes("Claude") || providerName.includes("Gemini")
				? 50
				: 25;

		// Calculate optimal size using binary search
		const optimalSize = await calculateOptimalChunkSize(
			items,
			maxTokens,
			async (testItems) => {
				if (
					!capabilities.supportsTokenMeasurement ||
					!provider.measureInputUsage
				) {
					return testItems.length * tokensPerItem;
				}

				const testData = testHistoryData.slice(0, testItems.length);
				const testPrompt = buildAnalysisPrompt(testItems, testData);
				return await provider.measureInputUsage(testPrompt, {
					responseConstraint: ANALYSIS_SCHEMA,
					signal: abortSignal,
				});
			},
			tokensPerItem,
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
				customPrompts,
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

// Shared helper for common analysis logic
async function analyzeWithAI<T>(
	items: chrome.history.HistoryItem[],
	aiConfig: AIProviderConfig,
	systemPrompt: string,
	responseConstraint: Record<string, unknown> | undefined,
	analysisType: string,
	parseResponse: (parsed: unknown) => T,
	onProgress?: ProgressCallback,
	abortSignal?: AbortSignal,
): Promise<T> {
	// Parse URLs for all items
	const historyData = items.map(parseHistoryItemUrl);

	// Build the analysis prompt
	const prompt = buildAnalysisPrompt(items, historyData);

	console.log(`\n=== Starting ${analysisType} Analysis ===`);
	console.log("Analysis details:", {
		promptLength: prompt.length,
		itemCount: items.length,
		analysisType: analysisType,
	});

	const provider = await getInitializedProvider(aiConfig, systemPrompt);

	if (!provider) {
		throw new Error("AI is not available.");
	}

	console.log(`Analyzing ${analysisType} for ${items.length} items`);

	// Check abort before making request
	if (abortSignal?.aborted) {
		throw new Error("Analysis cancelled");
	}
	console.log(`Sending ${analysisType} analysis prompt to AI...`);

	// Notify progress that we're sending analysis prompt
	if (onProgress) {
		onProgress({
			phase: "analyzing",
			subPhase: "sending-analysis",
			chunkDescription: `Analyzing ${analysisType} for ${items.length} items`,
		});
	}

	const startTime = performance.now();
	const response = await promptAI(provider, prompt, {
		responseConstraint: responseConstraint,
		signal: abortSignal,
	});
	const endTime = performance.now();
	const duration = ((endTime - startTime) / 1000).toFixed(2);

	console.log(
		`${analysisType} analysis completed in ${duration}s for ${items.length} items`,
	);

	// Notify that we received response
	if (onProgress) {
		onProgress({
			phase: "analyzing",
			subPhase: "processing",
			chunkDescription: `Processing ${analysisType} response (${duration}s)`,
		});
	}
	console.log(`=== ${analysisType} Analysis Complete ===`);

	try {
		// Clean the response to extract JSON from markdown if needed
		const cleanedResponse = extractJSONFromResponse(response);
		console.log(`[${analysisType}] Attempting to parse cleaned response`);
		const parsed = JSON.parse(cleanedResponse);
		console.log(`[${analysisType}] Parsed object keys:`, Object.keys(parsed));

		return parseResponse(parsed);
	} catch (error) {
		// Failed to parse AI analysis response
		console.error(`Failed to parse ${analysisType} response:`, error);
		console.error("Raw response length:", response.length);
		console.error(
			`[${analysisType}] First 1000 chars of raw response:`,
			response.substring(0, 1000),
		);
		throw error;
	}
}

// Analyze a single chunk of history items for user profile only
async function analyzeUserProfile(
	items: chrome.history.HistoryItem[],
	aiConfig: AIProviderConfig,
	customSystemPrompt?: string,
	onProgress?: ProgressCallback,
	abortSignal?: AbortSignal,
): Promise<UserProfile> {
	return analyzeWithAI(
		items,
		aiConfig,
		customSystemPrompt || USER_PROFILE_SYSTEM_PROMPT,
		USER_PROFILE_SCHEMA,
		"user profile",
		UserProfileSchema.parse,
		onProgress,
		abortSignal,
	);
}

// Analyze a single chunk of history items for workflow patterns only
async function analyzeWorkflowPatterns(
	items: chrome.history.HistoryItem[],
	aiConfig: AIProviderConfig,
	customSystemPrompt?: string,
	onProgress?: ProgressCallback,
	abortSignal?: AbortSignal,
): Promise<WorkflowPattern[]> {
	return analyzeWithAI(
		items,
		aiConfig,
		customSystemPrompt || WORKFLOW_PATTERNS_SYSTEM_PROMPT,
		WORKFLOW_PATTERNS_ONLY_SCHEMA,
		"workflow patterns",
		WorkflowPatternsOnlySchema.parse,
		onProgress,
		abortSignal,
	);
}

// Analyze a single chunk of history items
async function analyzeChunk(
	items: chrome.history.HistoryItem[],
	aiConfig: AIProviderConfig,
	customPrompts?: CustomPrompts,
	onProgress?: ProgressCallback,
	abortSignal?: AbortSignal,
	shouldAnalyzePatterns: boolean = true,
): Promise<{ userProfile: UserProfile; patterns: WorkflowPattern[] }> {
	console.log("\n=== Starting Combined Analysis ===");
	console.log("Analysis configuration:", {
		itemCount: items.length,
		shouldAnalyzePatterns: shouldAnalyzePatterns,
	});

	try {
		// Step 1: Always analyze user profile
		console.log("Step 1: Analyzing user profile...");
		const userProfile = await analyzeUserProfile(
			items,
			aiConfig,
			customPrompts?.userProfilePrompt,
			onProgress,
			abortSignal,
		);

		// Step 2: Conditionally analyze workflow patterns
		let patterns: WorkflowPattern[] = [];
		if (shouldAnalyzePatterns) {
			console.log("Step 2: Analyzing workflow patterns...");
			patterns = await analyzeWorkflowPatterns(
				items,
				aiConfig,
				customPrompts?.workflowPatternsPrompt,
				onProgress,
				abortSignal,
			);
			console.log(`Found ${patterns.length} workflow patterns`);
		} else {
			console.log("Step 2: Skipping workflow patterns (disabled)");
		}

		console.log("=== Combined Analysis Complete ===");
		return {
			userProfile,
			patterns,
		};
	} catch (error) {
		console.error("Failed to analyze chunk:", error);
		throw error;
	}
}
