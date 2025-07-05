/// <reference types="@types/dom-chromium-ai" />

import type {
	ChunkInfo,
	FullAnalysisResult,
	MemoryData,
	UserProfile,
	WorkflowPattern,
} from "./types";
import { loadAIConfig } from "./utils/ai-config";
import { getProvider } from "./utils/ai-provider-factory";
import { createAISession, promptAI } from "./utils/ai-session-factory";
import { type CustomPrompts, calculateStats } from "./utils/analyzer";
import { createHistoryChunks, identifyChunks } from "./utils/chunking";
import {
	ANALYSIS_SYSTEM_PROMPT,
	buildAnalysisPrompt,
	buildMergePrompt,
	MERGE_SYSTEM_PROMPT,
} from "./utils/constants";
import { type AnalysisMemory, createEmptyMemory } from "./utils/memory";
import type { AnalysisProgress } from "./utils/messaging";
import { onMessage, sendMessage } from "./utils/messaging";
import { ANALYSIS_SCHEMA, AnalysisResultSchema } from "./utils/schemas";
import {
	calculateOptimalChunkSize,
	extractJSONFromResponse,
	getMostRecentTimestamp,
} from "./utils/shared-utils";

// Track active analyses
const activeAnalyses = new Map<string, AbortController>();
let currentAnalysisId: string | null = null;

// Keepalive interval
let keepaliveInterval: number | null = null;

// Start keepalive mechanism
function startKeepalive() {
	if (keepaliveInterval !== null) return;

	keepaliveInterval = window.setInterval(() => {
		sendMessage("offscreen:keepalive", undefined).catch(() => {
			// Service worker might be inactive, ignore error
		});
	}, 20000); // Every 20 seconds
}

// Stop keepalive mechanism
function stopKeepalive() {
	if (keepaliveInterval !== null) {
		clearInterval(keepaliveInterval);
		keepaliveInterval = null;
	}
}

// Request memory from service worker
async function requestMemory(): Promise<AnalysisMemory> {
	try {
		const response = await sendMessage("offscreen:read-memory", undefined);
		return response.memory || createEmptyMemory();
	} catch (error) {
		console.error("[Offscreen] Failed to read memory:", error);
		return createEmptyMemory();
	}
}

// Save memory via service worker
async function saveMemory(memory: AnalysisMemory): Promise<void> {
	try {
		await sendMessage("offscreen:write-memory", { memory });
	} catch (error) {
		console.error("[Offscreen] Failed to save memory:", error);
		throw error;
	}
}

// Send progress update to service worker
async function sendProgress(progress: Omit<AnalysisProgress, "analysisId">) {
	if (!currentAnalysisId) return;

	try {
		await sendMessage("offscreen:progress", {
			...progress,
			analysisId: currentAnalysisId,
		});
	} catch (error) {
		// Service worker might be inactive, ignore error
		console.debug("[Offscreen] Failed to send progress:", error);
	}
}

// Hide tracking URL parameters (copied from analyzer.ts)
function hideTrackingParams(
	params: Record<string, string>,
): Record<string, string> {
	const filtered: Record<string, string> = {};

	// Known tracking/analytics parameters that don't help with browsing pattern analysis
	const trackingParams = new Set([
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
		"fbclid",
		"fb_action_ids",
		"fb_action_types",
		"msclkid",
		"yclid",
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
		"sid",
		"sessionid",
		"vid",
		"cid",
		"client_id",
		"s_kwcid",
		"ef_id",
		"ref",
		"referer",
		"referrer",
		"source",
	]);

	for (const [key, value] of Object.entries(params)) {
		const lowerKey = key.toLowerCase();
		const isTrackingParam =
			trackingParams.has(lowerKey) || /^(utm_|ga_|fb_|__)/i.test(key);

		if (isTrackingParam) {
			filtered[key] = "<hidden>";
		} else {
			filtered[key] = value;
		}
	}

	return filtered;
}

// Main analysis function (migrated from analyzer.ts)
async function analyzeHistoryItems(
	items: chrome.history.HistoryItem[],
	customPrompts?: CustomPrompts,
	_trigger: "manual" | "alarm" = "manual",
	abortSignal?: AbortSignal,
): Promise<FullAnalysisResult> {
	const analysisStartTime = performance.now();

	// Check if already aborted
	if (abortSignal?.aborted) {
		throw new Error("Analysis cancelled");
	}

	// Notify that we're calculating statistics
	console.log("[Offscreen] Starting analysis with", items.length, "items");
	await sendProgress({
		phase: "calculating",
		chunkProgress: {
			current: 0,
			total: 0,
			description: `Processing ${items.length} history items`,
		},
	});

	const stats = calculateStats(items);

	// Load existing memory
	let memory = await requestMemory();
	console.log(
		"[Offscreen] Memory loaded, patterns found:",
		memory.patterns.length,
	);

	// Check if aborted before chunking
	if (abortSignal?.aborted) {
		throw new Error("Analysis cancelled");
	}

	// Identify chunks using AI
	console.log("[Offscreen] Starting chunking phase");
	await sendProgress({
		phase: "chunking",
		chunkProgress: {
			current: 0,
			total: 0,
			description: `Analyzing ${items.length} items for time patterns`,
		},
	});

	const chunkingResult = await identifyChunks(
		items,
		customPrompts?.chunkPrompt,
	);
	console.log(
		"[Offscreen] Chunking result:",
		chunkingResult.timeRanges.length,
		"chunks identified",
	);

	const chunks = createHistoryChunks(
		items,
		chunkingResult.timeRanges,
		chunkingResult.isFallback,
	);
	console.log("[Offscreen] Created", chunks.length, "chunks for processing");

	if (chunks.length > 0) {
		await sendProgress({
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
			analysis: {
				patterns: memory.patterns,
				totalUrls: stats.totalUrls,
				dateRange: stats.dateRange,
				topDomains: stats.topDomains,
				userProfile: memory.userProfile,
			},
			diagnostics: {
				chunks: [],
				chunkingRawResponse: chunkingResult.rawResponse,
				chunkingError: chunkingResult.error,
			},
		};
	}

	// Store chunk info for the result
	const chunkInfos: ChunkInfo[] = chunks.map((chunk, index) => {
		const timeRange = chunkingResult.timeRanges[index];
		return {
			startTime: chunk.startTime,
			endTime: chunk.endTime,
			itemCount: chunk.items.length,
			description: chunk.isFallback
				? `${new Date(chunk.startTime).toLocaleDateString()} ${new Date(chunk.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} (Fallback)`
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

		await sendProgress({
			phase: "analyzing",
			chunkProgress: {
				current: processedChunks,
				total: totalChunks,
				description: `${chunk.items.length} items from ${new Date(chunk.startTime).toLocaleDateString()} - ${new Date(chunk.endTime).toLocaleDateString()}`,
			},
		});

		try {
			console.log(
				`[Offscreen] Processing chunk ${i + 1}/${totalChunks} with ${chunk.items.length} items`,
			);

			// Analyze this chunk
			const { results } = await analyzeChunkWithSubdivision(
				chunk.items,
				memory,
				customPrompts,
				abortSignal,
				processedChunks,
				totalChunks,
			);

			// Update memory with merged results
			if (results) {
				const mostRecentInChunk = getMostRecentTimestamp(chunk.items);

				memory = {
					userProfile: results.userProfile,
					patterns: results.patterns,
					lastAnalyzedDate: new Date(),
					lastHistoryTimestamp: Math.max(
						memory.lastHistoryTimestamp,
						mostRecentInChunk,
					),
					version: memory.version,
				};

				// Save memory after each chunk
				console.log(`[Offscreen] Saving memory after chunk ${i + 1}`);
				await saveMemory(memory);
			}

			// Small delay between chunks to avoid quota issues
			if (i < chunks.length - 1) {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		} catch (error) {
			console.error(`[Offscreen] Failed to analyze chunk ${i + 1}:`, error);
			// Continue with next chunk even if one fails
		}
	}

	// Final save with completion timestamp
	memory.lastAnalyzedDate = new Date();
	await saveMemory(memory);
	console.log("[Offscreen] Final memory saved with completion timestamp");

	// Return final results from memory
	const analysisEndTime = performance.now();
	const totalDuration = ((analysisEndTime - analysisStartTime) / 1000).toFixed(
		2,
	);
	console.log(
		`[Offscreen] Analysis Complete - Time: ${totalDuration}s, Items: ${stats.totalUrls}, Patterns: ${memory.patterns.length}`,
	);

	return {
		analysis: {
			patterns: memory.patterns,
			totalUrls: stats.totalUrls,
			dateRange: stats.dateRange,
			topDomains: stats.topDomains,
			userProfile: memory.userProfile,
		},
		diagnostics: {
			chunks: chunkInfos,
			chunkingRawResponse: chunkingResult.rawResponse,
			chunkingError: chunkingResult.error,
		},
	};
}

// Analyze a chunk with automatic subdivision if it's too large
async function analyzeChunkWithSubdivision(
	items: chrome.history.HistoryItem[],
	memory: AnalysisMemory,
	customPrompts?: CustomPrompts,
	abortSignal?: AbortSignal,
	chunkNumber?: number,
	totalChunks?: number,
): Promise<{
	processedItems: number;
	results: { userProfile: UserProfile; patterns: WorkflowPattern[] } | null;
}> {
	// First, try to analyze the entire chunk
	try {
		const analysisSystemPrompt =
			customPrompts?.systemPrompt || ANALYSIS_SYSTEM_PROMPT;

		// Try to analyze the entire chunk
		const chunkResults = await analyzeChunk(
			items,
			analysisSystemPrompt,
			abortSignal,
		);

		// Merge with existing memory
		const mergedResults =
			memory.patterns.length === 0 &&
			memory.userProfile.stableTraits.coreIdentities.length === 0
				? chunkResults
				: await mergeAnalysisResults(
						memory,
						chunkResults,
						customPrompts?.mergePrompt || MERGE_SYSTEM_PROMPT,
						abortSignal,
					);

		return { processedItems: items.length, results: mergedResults };
	} catch (error) {
		// Check if it's a token limit error
		if (error instanceof DOMException && error.name === "QuotaExceededError") {
			const config = await loadAIConfig();
			const provider = getProvider(config);
			console.log(
				`[Offscreen] Chunk with ${items.length} items exceeds token limit for ${provider.getProviderName()}, subdividing...`,
			);
		} else {
			throw error;
		}
	}

	// Need to subdivide the chunk
	console.log(
		"[Offscreen] Chunk too large, calculating optimal subdivision size...",
	);

	const config = await loadAIConfig();
	const provider = getProvider(config);
	const capabilities = provider.getCapabilities();

	const analysisSystemPrompt =
		customPrompts?.systemPrompt || ANALYSIS_SYSTEM_PROMPT;
	const session = await createAISession(analysisSystemPrompt);
	if (!session) {
		throw new Error("AI is not available for measuring tokens.");
	}

	let maxTokens = capabilities.optimalChunkTokens;
	if (session.inputQuota !== undefined && session.inputUsage !== undefined) {
		const availableTokens = session.inputQuota - session.inputUsage;
		console.log(`[Offscreen] Chrome AI available tokens: ${availableTokens}`);
		maxTokens = availableTokens;
	}

	// Calculate optimal size
	const optimalSize = await calculateOptimalChunkSize(
		items,
		maxTokens,
		async (testItems) => {
			if (
				!capabilities.supportsTokenMeasurement ||
				!session.measureInputUsage
			) {
				const tokensPerItem = provider.getProviderName().includes("Claude")
					? 50
					: 25;
				return testItems.length * tokensPerItem;
			}

			const testHistoryData = testItems.map((item) => {
				const urlParts: {
					domain: string;
					path: string;
					params: Record<string, string>;
				} = {
					domain: "",
					path: "",
					params: {},
				};

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
						Object.keys(urlParts.params).length > 0
							? urlParts.params
							: undefined,
					t: item.title || "",
					ts: item.lastVisitTime || 0,
					v: item.visitCount || 0,
				};
			});

			const testPrompt = buildAnalysisPrompt(testItems, testHistoryData);
			return await session.measureInputUsage(testPrompt, {
				responseConstraint: ANALYSIS_SCHEMA,
				signal: abortSignal,
			});
		},
		provider.getProviderName().includes("Claude") ? 50 : 25,
		abortSignal,
	);

	session.destroy();
	console.log(
		`[Offscreen] Optimal subdivision size: ${optimalSize} items per sub-chunk`,
	);

	// Process in sub-chunks
	let currentMemory = memory;
	let totalProcessed = 0;

	for (let i = 0; i < items.length; i += optimalSize) {
		if (abortSignal?.aborted) {
			throw new Error("Analysis cancelled");
		}

		const subItems = items.slice(i, i + optimalSize);
		console.log(
			`[Offscreen] Processing sub-chunk starting at index ${i}, ${subItems.length} items`,
		);

		const subChunkNum = Math.floor(i / optimalSize) + 1;
		const totalSubChunks = Math.ceil(items.length / optimalSize);
		const mainChunkInfo =
			chunkNumber && totalChunks ? `Chunk ${chunkNumber}/${totalChunks}: ` : "";

		await sendProgress({
			phase: "analyzing",
			chunkProgress: {
				current: chunkNumber || subChunkNum,
				total: totalChunks || totalSubChunks,
				description: `${mainChunkInfo}Processing ${subItems.length} items (sub-chunk ${subChunkNum}/${totalSubChunks})`,
			},
		});

		const subResults = await analyzeChunk(
			subItems,
			analysisSystemPrompt,
			abortSignal,
		);

		const mergedResults =
			currentMemory.patterns.length === 0 &&
			currentMemory.userProfile.stableTraits.coreIdentities.length === 0 &&
			memory.patterns.length === 0 &&
			memory.userProfile.stableTraits.coreIdentities.length === 0
				? subResults
				: await mergeAnalysisResults(
						currentMemory,
						subResults,
						customPrompts?.mergePrompt || MERGE_SYSTEM_PROMPT,
						abortSignal,
					);

		const mostRecentInSubChunk = getMostRecentTimestamp(subItems);

		currentMemory = {
			userProfile: mergedResults.userProfile,
			patterns: mergedResults.patterns,
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
			patterns: currentMemory.patterns,
		},
	};
}

// Analyze a single chunk of history items
async function analyzeChunk(
	items: chrome.history.HistoryItem[],
	customSystemPrompt?: string,
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
			q: Object.keys(urlParts.params).length > 0 ? urlParts.params : undefined,
			t: item.title || "",
			ts: item.lastVisitTime || 0,
			v: item.visitCount || 0,
		};
	});

	const prompt = buildAnalysisPrompt(items, historyData);
	console.log(`[Offscreen] Analyzing chunk with ${items.length} items`);

	const session = await createAISession(
		customSystemPrompt || ANALYSIS_SYSTEM_PROMPT,
	);
	if (!session) {
		throw new Error("AI is not available.");
	}

	try {
		if (abortSignal?.aborted) {
			throw new Error("Analysis cancelled");
		}

		await sendProgress({
			phase: "analyzing",
			subPhase: "sending-analysis",
		});

		const startTime = performance.now();
		const response = await promptAI(session, prompt, {
			responseConstraint: ANALYSIS_SCHEMA,
			signal: abortSignal,
		});
		const endTime = performance.now();
		const duration = ((endTime - startTime) / 1000).toFixed(2);

		console.log(
			`[Offscreen] Analysis LLM call completed in ${duration}s for ${items.length} items`,
		);

		await sendProgress({
			phase: "analyzing",
			subPhase: "processing",
		});

		try {
			const cleanedResponse = extractJSONFromResponse(response);
			const parsed = JSON.parse(cleanedResponse);
			const validated = AnalysisResultSchema.parse(parsed);

			return {
				patterns: validated.patterns,
				userProfile: validated.userProfile,
			};
		} catch (error) {
			console.error("[Offscreen] Failed to parse AI response:", error);
			throw error;
		}
	} finally {
		session.destroy();
	}
}

// Merge new analysis results with existing results using LLM
async function mergeAnalysisResults(
	memory: AnalysisMemory,
	newResults: MemoryData,
	customSystemPrompt?: string,
	abortSignal?: AbortSignal,
): Promise<MemoryData> {
	if (abortSignal?.aborted) {
		throw new Error("Analysis cancelled");
	}

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
	);

	console.log("[Offscreen] Merging analysis results:", {
		existingPatterns: memory.patterns.length,
		newPatterns: newResults.patterns.length,
	});

	const session = await createAISession(
		customSystemPrompt || MERGE_SYSTEM_PROMPT,
	);
	if (!session) {
		throw new Error("AI is not available for merging.");
	}

	try {
		await sendProgress({
			phase: "analyzing",
			subPhase: "sending-merge",
		});

		const startTime = performance.now();
		const response = await promptAI(session, mergePrompt, {
			responseConstraint: ANALYSIS_SCHEMA,
			signal: abortSignal,
		});
		const endTime = performance.now();
		const duration = ((endTime - startTime) / 1000).toFixed(2);

		console.log(`[Offscreen] Merge LLM call completed in ${duration}s`);

		await sendProgress({
			phase: "analyzing",
			subPhase: "processing",
		});

		try {
			const cleanedResponse = extractJSONFromResponse(response);
			const parsed = JSON.parse(cleanedResponse);
			const validated = AnalysisResultSchema.parse(parsed);

			return {
				patterns: validated.patterns,
				userProfile: validated.userProfile,
			};
		} catch (parseError) {
			console.error("[Offscreen] Failed to parse merge response:", parseError);
			return newResults;
		}
	} finally {
		session.destroy();
	}
}

// Set up message handlers
onMessage("offscreen:start-analysis", async (message) => {
	const { historyItems, customPrompts, analysisId, trigger } = message.data;

	// Cancel any existing analysis
	if (currentAnalysisId && activeAnalyses.has(currentAnalysisId)) {
		const oldController = activeAnalyses.get(currentAnalysisId);
		oldController?.abort();
		activeAnalyses.delete(currentAnalysisId);
	}

	// Start new analysis
	currentAnalysisId = analysisId;
	const abortController = new AbortController();
	activeAnalyses.set(analysisId, abortController);

	// Start keepalive
	startKeepalive();

	try {
		const result = await analyzeHistoryItems(
			historyItems,
			customPrompts,
			trigger,
			abortController.signal,
		);

		await sendProgress({ phase: "complete" });

		// Send completion message
		await sendMessage("offscreen:analysis-complete", {
			analysisId,
			result,
		});
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";

		await sendProgress({
			phase: "error",
		});

		// Send error message
		await sendMessage("offscreen:analysis-error", {
			analysisId,
			error: errorMessage,
		});
	} finally {
		activeAnalyses.delete(analysisId);
		if (currentAnalysisId === analysisId) {
			currentAnalysisId = null;
		}

		// Stop keepalive if no active analyses
		if (activeAnalyses.size === 0) {
			stopKeepalive();
		}
	}
});

onMessage("offscreen:cancel", async (message) => {
	const { analysisId } = message.data;

	if (analysisId && activeAnalyses.has(analysisId)) {
		const controller = activeAnalyses.get(analysisId);
		controller?.abort();
		activeAnalyses.delete(analysisId);

		if (currentAnalysisId === analysisId) {
			currentAnalysisId = null;
		}

		// Stop keepalive if no active analyses
		if (activeAnalyses.size === 0) {
			stopKeepalive();
		}

		return { success: true };
	} else {
		return { success: false, error: "Analysis not found" };
	}
});

console.log("[Offscreen] Document initialized");
