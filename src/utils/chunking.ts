import {
	endOfDay,
	format,
	setHours,
	setMinutes,
	setSeconds,
	startOfDay,
} from "date-fns";
import type { z } from "zod/v4";
import { getInitializedProvider, promptAI } from "./ai-provider-utils";
import { buildChunkingPrompt, CHUNK_SYSTEM_PROMPT } from "./constants";
import type { ChunkTimeRange, HistoryChunk } from "./memory";
import { CHUNK_SCHEMA, ChunkSchema } from "./schemas";
import { extractJSONFromResponse } from "./shared-utils";

interface ChunkingResult {
	timeRanges: ChunkTimeRange[];
	rawResponse?: string;
	error?: string;
	isFallback: boolean;
}

// Analyze timestamps to identify natural browsing sessions
export async function identifyChunks(
	items: chrome.history.HistoryItem[],
	customChunkPrompt?: string,
): Promise<ChunkingResult> {
	if (items.length === 0) {
		return {
			timeRanges: [],
			isFallback: false,
		};
	}

	// Extract timestamps and sort them
	const timestamps = items
		.map((item) => item.lastVisitTime)
		.filter((time): time is number => time !== undefined)
		.sort((a, b) => a - b);

	if (timestamps.length === 0) {
		return {
			timeRanges: [],
			isFallback: false,
		};
	}

	// Recursively analyze timestamps in batches if too many
	const MAX_TIMESTAMPS_PER_BATCH = 80; // Conservative limit to stay under token limits
	if (timestamps.length > MAX_TIMESTAMPS_PER_BATCH) {
		return await analyzeTimestampsInBatches(timestamps, customChunkPrompt);
	}

	const prompt = buildChunkingPrompt(timestamps);

	console.log("\n=== Starting Chunking ===");
	console.log("Prompt Length:", prompt.length, "characters");
	console.log("Timestamp count:", timestamps.length);
	console.log("======================\n");

	const provider = await getInitializedProvider(
		customChunkPrompt || CHUNK_SYSTEM_PROMPT,
	);

	if (!provider) {
		// Fallback to half-day chunking
		return {
			timeRanges: createHalfDayChunks(timestamps),
			error: "Failed to initialize AI provider",
			isFallback: true,
		};
	}

	try {
		const startTime = performance.now();
		const response = await promptAI(provider, prompt, {
			responseConstraint: CHUNK_SCHEMA,
		});
		const endTime = performance.now();
		const duration = ((endTime - startTime) / 1000).toFixed(2);
		console.log(
			`Chunking LLM call completed in ${duration}s for ${items.length} items`,
		);
		console.log("Response Length:", response.length, "characters");
		console.log("=== Chunking Complete ===");

		let parsed: z.infer<typeof ChunkSchema>;
		try {
			// Clean the response to extract JSON from markdown if needed
			const cleanedResponse = extractJSONFromResponse(response);
			const rawParsed = JSON.parse(cleanedResponse);

			// Validate with zod schema
			parsed = ChunkSchema.parse(rawParsed);
		} catch (parseError) {
			return {
				timeRanges: createHalfDayChunks(timestamps),
				rawResponse: response,
				error: `Failed to parse JSON: ${parseError}`,
				isFallback: true,
			};
		}

		// Convert indices to timestamps and validate
		const validChunks: ChunkTimeRange[] = parsed.chunks
			.filter(
				(chunk) =>
					chunk.startIndex >= 0 &&
					chunk.endIndex < timestamps.length &&
					chunk.startIndex <= chunk.endIndex,
			)
			.map((chunk) => ({
				startTime: timestamps[chunk.startIndex],
				endTime: timestamps[chunk.endIndex],
				description: chunk.description,
			}))
			.sort(
				(a: ChunkTimeRange, b: ChunkTimeRange) => a.startTime - b.startTime,
			);

		// Chunks identified successfully

		// If AI didn't return any valid chunks, fall back to simple chunking
		if (validChunks.length === 0) {
			// AI returned no valid chunks, falling back to half-day chunking
			return {
				timeRanges: createHalfDayChunks(timestamps),
				rawResponse: response,
				error: "AI returned no valid chunks",
				isFallback: true,
			};
		}

		return {
			timeRanges: validChunks,
			rawResponse: response,
			isFallback: false,
		};
	} catch (error) {
		// Failed to identify chunks with AI, falling back
		return {
			timeRanges: createHalfDayChunks(timestamps),
			error: error instanceof Error ? error.message : String(error),
			isFallback: true,
		};
	} finally {
		// No cleanup needed with stateless providers
	}
}

// Helper to analyze large timestamp sets in batches
async function analyzeTimestampsInBatches(
	timestamps: number[],
	customChunkPrompt?: string,
): Promise<ChunkingResult> {
	const MAX_TIMESTAMPS_PER_BATCH = 80;
	const allTimeRanges: ChunkTimeRange[] = [];
	let hasError = false;
	let errorMessage = "";

	// Process timestamps in batches
	for (let i = 0; i < timestamps.length; i += MAX_TIMESTAMPS_PER_BATCH) {
		const batchTimestamps = timestamps.slice(i, i + MAX_TIMESTAMPS_PER_BATCH);

		// Create temporary items for this batch
		const batchItems: chrome.history.HistoryItem[] = batchTimestamps.map(
			(ts) => ({
				lastVisitTime: ts,
				url: "",
				id: "",
			}),
		);

		try {
			const batchResult = await identifyChunksForBatch(
				batchItems,
				customChunkPrompt,
			);

			if (batchResult.isFallback) {
				hasError = true;
				errorMessage = batchResult.error || "Batch processing failed";
			}

			allTimeRanges.push(...batchResult.timeRanges);
		} catch (error) {
			hasError = true;
			errorMessage = error instanceof Error ? error.message : String(error);
			// Use fallback for this batch
			const fallbackRanges = createHalfDayChunks(batchTimestamps);
			allTimeRanges.push(...fallbackRanges);
		}
	}

	// Merge adjacent or overlapping time ranges
	const mergedRanges = mergeTimeRanges(allTimeRanges);

	return {
		timeRanges: mergedRanges,
		isFallback: hasError,
		error: hasError ? errorMessage : undefined,
	};
}

// Helper to identify chunks for a batch (without recursion)
async function identifyChunksForBatch(
	items: chrome.history.HistoryItem[],
	customChunkPrompt?: string,
): Promise<ChunkingResult> {
	if (items.length === 0) {
		return {
			timeRanges: [],
			isFallback: false,
		};
	}

	// Extract timestamps and sort them
	const timestamps = items
		.map((item) => item.lastVisitTime)
		.filter((time): time is number => time !== undefined)
		.sort((a, b) => a - b);

	if (timestamps.length === 0) {
		return {
			timeRanges: [],
			isFallback: false,
		};
	}

	const prompt = buildChunkingPrompt(timestamps);

	console.log("\n=== Starting Batch Chunking ===");
	console.log("Prompt Length:", prompt.length, "characters");
	console.log("Batch timestamp count:", timestamps.length);
	console.log("=============================\n");

	const provider = await getInitializedProvider(
		customChunkPrompt || CHUNK_SYSTEM_PROMPT,
	);

	if (!provider) {
		// Fallback to half-day chunking
		return {
			timeRanges: createHalfDayChunks(timestamps),
			error: "Failed to initialize AI provider",
			isFallback: true,
		};
	}

	try {
		const startTime = performance.now();
		const response = await promptAI(provider, prompt, {
			responseConstraint: CHUNK_SCHEMA,
		});
		const endTime = performance.now();
		const duration = ((endTime - startTime) / 1000).toFixed(2);
		console.log(
			`Chunking LLM call completed in ${duration}s for ${items.length} items`,
		);
		console.log("Response Length:", response.length, "characters");
		console.log("=== Chunking Complete ===");

		let parsed: z.infer<typeof ChunkSchema>;
		try {
			// Clean the response to extract JSON from markdown if needed
			const cleanedResponse = extractJSONFromResponse(response);
			const rawParsed = JSON.parse(cleanedResponse);

			// Validate with zod schema
			parsed = ChunkSchema.parse(rawParsed);
		} catch (parseError) {
			return {
				timeRanges: createHalfDayChunks(timestamps),
				rawResponse: response,
				error: `Failed to parse JSON: ${parseError}`,
				isFallback: true,
			};
		}

		// Convert indices to timestamps and validate
		const validChunks: ChunkTimeRange[] = parsed.chunks
			.filter(
				(chunk) =>
					chunk.startIndex >= 0 &&
					chunk.endIndex < timestamps.length &&
					chunk.startIndex <= chunk.endIndex,
			)
			.map((chunk) => ({
				startTime: timestamps[chunk.startIndex],
				endTime: timestamps[chunk.endIndex],
				description: chunk.description,
			}))
			.sort(
				(a: ChunkTimeRange, b: ChunkTimeRange) => a.startTime - b.startTime,
			);

		// If AI didn't return any valid chunks, fall back to simple chunking
		if (validChunks.length === 0) {
			return {
				timeRanges: createHalfDayChunks(timestamps),
				rawResponse: response,
				error: "AI returned no valid chunks",
				isFallback: true,
			};
		}

		return {
			timeRanges: validChunks,
			rawResponse: response,
			isFallback: false,
		};
	} catch (error) {
		return {
			timeRanges: createHalfDayChunks(timestamps),
			error: error instanceof Error ? error.message : String(error),
			isFallback: true,
		};
	} finally {
		// No cleanup needed with stateless providers
	}
}

// Helper to merge overlapping or adjacent time ranges
function mergeTimeRanges(ranges: ChunkTimeRange[]): ChunkTimeRange[] {
	if (ranges.length === 0) return [];

	// Sort by start time
	const sorted = [...ranges].sort((a, b) => a.startTime - b.startTime);
	const merged: ChunkTimeRange[] = [];

	let current = sorted[0];
	for (let i = 1; i < sorted.length; i++) {
		const next = sorted[i];

		// If ranges overlap or are adjacent (within 1 minute), merge them
		if (current.endTime >= next.startTime - 60000) {
			current = {
				startTime: current.startTime,
				endTime: Math.max(current.endTime, next.endTime),
				description: `${current.description} + ${next.description}`,
			};
		} else {
			merged.push(current);
			current = next;
		}
	}
	merged.push(current);

	return merged;
}

// Fallback chunking that creates half-day chunks (12am-12pm, 12pm-12am)
export function createHalfDayChunks(timestamps: number[]): ChunkTimeRange[] {
	if (timestamps.length === 0) return [];

	const sortedTimestamps = [...timestamps].sort((a, b) => a - b);

	const chunks = new Map<string, { startTime: number; endTime: number }>();

	for (const ts of sortedTimestamps) {
		const date = new Date(ts);
		const period = date.getHours() < 12 ? "AM" : "PM";
		const key = `${format(date, "yyyy-MM-dd")}-${period}`;

		if (!chunks.has(key)) {
			const baseDate = startOfDay(date);
			const startTime =
				period === "AM" ? baseDate.getTime() : setHours(baseDate, 12).getTime();
			const endTime =
				period === "AM"
					? setSeconds(setMinutes(setHours(baseDate, 11), 59), 59).getTime() +
						999
					: endOfDay(baseDate).getTime();
			chunks.set(key, { startTime, endTime });
		}
	}

	return Array.from(chunks.values()).map(({ startTime, endTime }) => {
		const startDate = new Date(startTime);
		const period =
			startDate.getHours() < 12
				? "Morning (12am-12pm)"
				: "Afternoon/Evening (12pm-12am)";
		return {
			startTime,
			endTime,
			description: `${format(startDate, "PP")} ${period}`,
		};
	});
}

// Create HistoryChunk objects from time ranges
export function createHistoryChunks(
	items: chrome.history.HistoryItem[],
	timeRanges: ChunkTimeRange[],
	isFallback: boolean = false,
): HistoryChunk[] {
	if (items.length === 0) {
		return [];
	}

	// Helper to map items to a given set of time ranges
	const mapItemsToRanges = (
		ranges: ChunkTimeRange[],
		fallbackStatus: boolean,
	): HistoryChunk[] => {
		return ranges
			.map((range, index) => {
				const chunkItems = items.filter((item) => {
					if (!item.lastVisitTime) return false;
					return (
						item.lastVisitTime >= range.startTime &&
						item.lastVisitTime <= range.endTime
					);
				});

				if (chunkItems.length > 0) {
					return {
						startTime: new Date(range.startTime),
						endTime: new Date(range.endTime),
						items: chunkItems,
						chunkIndex: index,
						totalChunks: ranges.length,
						isFallback: fallbackStatus,
					} as HistoryChunk;
				}
				return null;
			})
			.filter((chunk): chunk is HistoryChunk => chunk !== null);
	};

	// First, try to create chunks with the provided time ranges
	let chunks = mapItemsToRanges(timeRanges, isFallback);

	// Validate coverage if not a fallback and we have chunks
	if (!isFallback && chunks.length > 0) {
		// Validate that all items are covered
		const coveredItems = new Set<string>();
		chunks.forEach((chunk) => {
			chunk.items.forEach((item) => {
				if (item.id) coveredItems.add(item.id);
			});
		});

		// Find uncovered items
		const uncoveredItems = items.filter((item) => {
			return item.id && !coveredItems.has(item.id) && item.lastVisitTime;
		});

		// If there are uncovered items, create fallback chunks for them
		if (uncoveredItems.length > 0) {
			console.log(
				`Found ${uncoveredItems.length} uncovered items, creating fallback chunks`,
			);

			const uncoveredTimestamps = uncoveredItems
				.map((item) => item.lastVisitTime)
				.filter((time): time is number => !!time);

			if (uncoveredTimestamps.length > 0) {
				const fallbackRanges = createHalfDayChunks(uncoveredTimestamps);
				const fallbackChunks = fallbackRanges
					.map((range, index) => {
						const chunkItems = uncoveredItems.filter((item) => {
							if (!item.lastVisitTime) return false;
							return (
								item.lastVisitTime >= range.startTime &&
								item.lastVisitTime <= range.endTime
							);
						});

						if (chunkItems.length > 0) {
							return {
								startTime: new Date(range.startTime),
								endTime: new Date(range.endTime),
								items: chunkItems,
								chunkIndex: chunks.length + index,
								totalChunks: chunks.length + fallbackRanges.length,
								isFallback: true,
							} as HistoryChunk;
						}
						return null;
					})
					.filter((chunk): chunk is HistoryChunk => chunk !== null);

				chunks = [...chunks, ...fallbackChunks];

				// Update total chunks count for all chunks
				chunks.forEach((chunk, index) => {
					chunk.chunkIndex = index;
					chunk.totalChunks = chunks.length;
				});
			}
		}
	}

	// If no chunks were created and it wasn't already a fallback, use the fallback logic
	if (chunks.length === 0 && !isFallback) {
		const timestamps = items
			.map((item) => item.lastVisitTime)
			.filter((time): time is number => !!time);

		if (timestamps.length > 0) {
			const fallbackRanges = createHalfDayChunks(timestamps);
			chunks = mapItemsToRanges(fallbackRanges, true);
		}
	}

	return chunks;
}
