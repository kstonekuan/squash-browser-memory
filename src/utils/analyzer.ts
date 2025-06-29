import type {
	AnalysisResult,
	ChunkInfo,
	UserProfile,
	WorkflowPattern,
} from "../types";
import { createChromeAISession } from "./chrome-ai";
import { createHistoryChunks, identifyChunks } from "./chunking";
import { DEFAULT_SYSTEM_PROMPT } from "./constants";
import {
	type AnalysisMemory,
	createEmptyMemory,
	type HistoryChunk,
	loadMemory,
	mergeMemoryWithResults,
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

		// Subdivide large chunks to respect token limits
		const subChunks = subdivideChunk(chunk, memory);

		for (let j = 0; j < subChunks.length; j++) {
			const subChunk = subChunks[j];
			processedChunks++;

			// Check if aborted before processing sub-chunk
			if (abortSignal?.aborted) {
				throw new Error("Analysis cancelled");
			}

			if (onProgress) {
				onProgress({
					phase: "analyzing",
					currentChunk: processedChunks,
					totalChunks:
						totalChunks *
						Math.max(
							1,
							Math.ceil(
								chunks.reduce((sum, c) => sum + c.items.length, 0) /
									50 /
									chunks.length,
							),
						),
					chunkDescription: `${chunk.startTime.toLocaleDateString()} - ${chunk.endTime.toLocaleDateString()} (part ${j + 1}/${subChunks.length})`,
				});
			}

			try {
				// Analyze this sub-chunk with memory context
				const chunkResult = await analyzeChunkWithMemory(
					subChunk.items,
					memory,
					customPrompts?.systemPrompt,
					onProgress,
					abortSignal,
				);

				// Merge results into memory
				memory = mergeMemoryWithResults(
					memory,
					chunkResult.userProfile,
					chunkResult.patterns,
					subChunk.items.length,
				);

				// Save memory after each sub-chunk
				await saveMemory(memory);

				// Add a delay between sub-chunks to avoid quota issues
				if (i < chunks.length - 1 || j < subChunks.length - 1) {
					await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
				}
			} catch (error) {
				console.error(`Failed to analyze chunk ${i + 1} part ${j + 1}:`, error);
				// Continue with next sub-chunk even if one fails
			}
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

// Helper function to subdivide large chunks considering memory context size
function subdivideChunk(
	chunk: HistoryChunk,
	memory: AnalysisMemory,
): HistoryChunk[] {
	// Estimate memory context size (rough approximation)
	// Memory context includes: profession, interests, patterns, summary
	const memoryContextSize =
		memory.totalItemsAnalyzed > 0
			? 200 + // Base prompt text
				memory.userProfile.profession.length +
				memory.userProfile.interests.slice(0, 5).join(", ").length +
				memory.patterns
					.slice(0, 3)
					.map((p) => p.pattern)
					.join(", ").length +
				memory.userProfile.summary.length
			: 0;

	// Estimate tokens used by memory context (rough: 1 token ≈ 4 chars)
	const memoryTokens = Math.ceil(memoryContextSize / 4);

	// Available tokens for history data (1024 limit - memory - prompt structure)
	const availableTokens = Math.max(200, 800 - memoryTokens); // Keep at least 200 for data

	// Estimate tokens per item (domain + title + metadata ≈ 20 tokens each)
	const tokensPerItem = 20;

	// Calculate max items per sub-chunk
	const maxItemsPerSubChunk = Math.max(
		10,
		Math.floor(availableTokens / tokensPerItem),
	);

	// If chunk is small enough, return as is
	if (chunk.items.length <= maxItemsPerSubChunk) {
		return [chunk];
	}

	// Subdivide into smaller chunks
	const subChunks: HistoryChunk[] = [];
	for (let i = 0; i < chunk.items.length; i += maxItemsPerSubChunk) {
		subChunks.push({
			...chunk,
			items: chunk.items.slice(i, i + maxItemsPerSubChunk),
			chunkIndex: chunk.chunkIndex,
			totalChunks: chunk.totalChunks,
		});
	}

	console.log(
		`Subdivided chunk with ${chunk.items.length} items into ${subChunks.length} sub-chunks of max ${maxItemsPerSubChunk} items (memory uses ~${memoryTokens} tokens)`,
	);

	return subChunks;
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

// Analyze a single chunk with memory context
async function analyzeChunkWithMemory(
	items: chrome.history.HistoryItem[],
	memory: AnalysisMemory,
	customSystemPrompt?: string,
	onProgress?: ProgressCallback,
	abortSignal?: AbortSignal,
): Promise<{ userProfile: UserProfile; patterns: WorkflowPattern[] }> {
	// Parse URLs to provide structured data to the LLM
	// Note: subdivideChunk ensures chunks fit within token limits
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
			q: Object.keys(urlParts.params).length > 0 ? urlParts.params : undefined, // all query params
			t: item.title || "", // full title
			ts: item.lastVisitTime || 0, // timestamp
			v: item.visitCount || 0, // visit count
		};
	});

	// Create the analysis prompt with memory context
	const memoryContext =
		memory.totalItemsAnalyzed > 0
			? `

Previous analysis context (from ${memory.totalItemsAnalyzed} previously analyzed items):
- User Profile: ${memory.userProfile.profession}, interests include ${memory.userProfile.interests.slice(0, 5).join(", ")}
- Known patterns: ${memory.patterns
					.slice(0, 3)
					.map((p) => p.pattern)
					.join(", ")}
- Summary: ${memory.userProfile.summary}

Build upon this existing knowledge, refining and updating it with new information from this chunk.
`
			: "";

	const prompt = `Analyze this chunk of browsing history data to:
1. Identify repetitive workflows that can be automated or optimized
2. Update/refine the user profile based on new browsing patterns
${memoryContext}

Chunk info: ${items.length} items
Time: ${items[0]?.lastVisitTime ? new Date(items[0].lastVisitTime).toLocaleDateString() : "unknown"} to ${items[items.length - 1]?.lastVisitTime ? new Date(items[items.length - 1]?.lastVisitTime || 0).toLocaleDateString() : "unknown"}

Data (d=domain, p=path, q=query params, t=title, ts=timestamp, v=visits):
${JSON.stringify(historyData)}

Focus on identifying:
- Repetitive workflows and patterns
- User profession and interests
- Work habits and technology use

${memory.totalItemsAnalyzed > 0 ? "Update and refine the existing profile with new insights rather than starting from scratch." : "Create an initial profile based on this data."}`;

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

			return {
				patterns: parsed.patterns,
				userProfile: parsed.userProfile,
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
