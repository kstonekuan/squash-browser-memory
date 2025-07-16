import {
	endOfDay,
	format,
	setHours,
	setMinutes,
	setSeconds,
	startOfDay,
} from "date-fns";
import { toJSONSchema, type z } from "zod/v4";
import type { ChunkingResult, ChunkTimeRange } from "../types";
import type { AIProviderConfig } from "./ai-interface";
import { getInitializedProvider, promptAI } from "./ai-provider-utils";
import { buildChunkingPrompt, CHUNK_SYSTEM_PROMPT } from "./constants";
import type { HistoryChunk } from "./memory";
import { ChunkSchema } from "./schemas";
import { extractJSONFromResponse } from "./shared-utils";

const MAX_TIMESTAMPS_PER_BATCH = 80; // Conservative limit to stay under token limits

// Analyze timestamps to identify natural browsing sessions
export async function identifyChunks(
	items: chrome.history.HistoryItem[],
	aiConfig: AIProviderConfig,
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

	// Split timestamps into batches
	const batches: number[][] = [];
	for (let i = 0; i < timestamps.length; i += MAX_TIMESTAMPS_PER_BATCH) {
		batches.push(timestamps.slice(i, i + MAX_TIMESTAMPS_PER_BATCH));
	}

	console.log(`\n=== Starting Chunking Analysis ===`);
	console.log(`Total timestamps: ${timestamps.length}`);
	console.log(
		`Split into ${batches.length} batch(es) of max ${MAX_TIMESTAMPS_PER_BATCH} timestamps each`,
	);
	console.log(`================================\n`);

	// Process each batch
	const allTimeRanges: ChunkTimeRange[] = [];
	let hasError = false;
	let errorMessage = "";

	for (let i = 0; i < batches.length; i++) {
		const batch = batches[i];
		console.log(
			`\nProcessing batch ${i + 1}/${batches.length} (${batch.length} timestamps)`,
		);

		try {
			const batchResult = await processSingleBatch(
				batch,
				aiConfig,
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
			const fallbackRanges = createHalfDayChunks(batch);
			allTimeRanges.push(...fallbackRanges);
		}
	}

	// Merge adjacent or overlapping time ranges if we have multiple batches
	const finalRanges =
		batches.length > 1 ? mergeTimeRanges(allTimeRanges) : allTimeRanges;

	console.log(`\n=== Chunking Complete ===`);
	console.log(`Total chunks identified: ${finalRanges.length}`);
	console.log(`========================\n`);

	return {
		timeRanges: finalRanges,
		isFallback: hasError,
		error: hasError ? errorMessage : undefined,
	};
}

// Process a single batch of timestamps
async function processSingleBatch(
	timestamps: number[],
	aiConfig: AIProviderConfig,
	customChunkPrompt?: string,
): Promise<ChunkingResult> {
	if (timestamps.length === 0) {
		return {
			timeRanges: [],
			isFallback: false,
		};
	}

	const prompt = buildChunkingPrompt(timestamps);

	console.log("Prompt Length:", prompt.length, "characters");

	const provider = await getInitializedProvider(
		aiConfig,
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
			responseConstraint: toJSONSchema(ChunkSchema),
		});
		const endTime = performance.now();
		const duration = ((endTime - startTime) / 1000).toFixed(2);
		console.log(
			`Chunking LLM call completed in ${duration}s for ${timestamps.length} timestamps`,
		);

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
		const validChunks: ChunkTimeRange[] = parsed
			.filter(
				(chunk) =>
					chunk.startIndex >= 0 &&
					chunk.endIndex < timestamps.length &&
					chunk.startIndex <= chunk.endIndex,
			)
			.map((chunk) => ({
				startTime: timestamps[chunk.startIndex],
				endTime: timestamps[chunk.endIndex],
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
		// Failed to identify chunks with AI, falling back
		return {
			timeRanges: createHalfDayChunks(timestamps),
			error: error instanceof Error ? error.message : String(error),
			isFallback: true,
		};
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
		return {
			startTime,
			endTime,
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
