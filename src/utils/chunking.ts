import { createChromeAISession, promptChromeAI } from "./chrome-ai";
import { buildChunkingPrompt, DEFAULT_CHUNK_SYSTEM_PROMPT } from "./constants";
import type { ChunkTimeRange, HistoryChunk } from "./memory";
import { CHUNK_SCHEMA } from "./schemas";

export interface ChunkingResult {
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

	const session = await createChromeAISession(
		customChunkPrompt || DEFAULT_CHUNK_SYSTEM_PROMPT,
	);

	if (!session) {
		// Fallback to half-day chunking
		return {
			timeRanges: createHalfDayChunks(timestamps),
			error: "Failed to create Chrome AI session",
			isFallback: true,
		};
	}

	// Helper for retrying on quota errors
	const retryWithBackoff = async <T>(
		fn: () => Promise<T>,
		maxRetries = 3,
		baseDelay = 2000,
	): Promise<T> => {
		for (let i = 0; i < maxRetries; i++) {
			try {
				return await fn();
			} catch (error) {
				const isLastAttempt = i === maxRetries - 1;

				// Only retry on quota errors
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
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
		throw new Error("Max retries exceeded");
	};

	try {
		const startTime = performance.now();
		const response = await retryWithBackoff(async () => {
			return await promptChromeAI(session, prompt, {
				responseConstraint: CHUNK_SCHEMA,
			});
		});
		const endTime = performance.now();
		const duration = ((endTime - startTime) / 1000).toFixed(2);
		console.log(
			`Chunking LLM call completed in ${duration}s for ${items.length} items`,
		);

		let parsed: {
			chunks?: Array<{
				startIndex: number;
				endIndex: number;
				description: string;
			}>;
		};
		try {
			parsed = JSON.parse(response);
		} catch (parseError) {
			return {
				timeRanges: createHalfDayChunks(timestamps),
				rawResponse: response,
				error: `Failed to parse JSON: ${parseError}`,
				isFallback: true,
			};
		}

		if (!parsed.chunks || !Array.isArray(parsed.chunks)) {
			return {
				timeRanges: createHalfDayChunks(timestamps),
				rawResponse: response,
				error: "Response missing 'chunks' array",
				isFallback: true,
			};
		}

		// Convert indices to timestamps and validate
		const validChunks: ChunkTimeRange[] = parsed.chunks
			.filter(
				(chunk) =>
					typeof chunk.startIndex === "number" &&
					typeof chunk.endIndex === "number" &&
					chunk.startIndex >= 0 &&
					chunk.endIndex < timestamps.length &&
					chunk.startIndex <= chunk.endIndex &&
					typeof chunk.description === "string",
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
		session.destroy();
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

	const session = await createChromeAISession(
		customChunkPrompt || DEFAULT_CHUNK_SYSTEM_PROMPT,
	);

	if (!session) {
		// Fallback to half-day chunking
		return {
			timeRanges: createHalfDayChunks(timestamps),
			error: "Failed to create Chrome AI session",
			isFallback: true,
		};
	}

	// Helper for retrying on quota errors
	const retryWithBackoff = async <T>(
		fn: () => Promise<T>,
		maxRetries = 3,
		baseDelay = 2000,
	): Promise<T> => {
		for (let i = 0; i < maxRetries; i++) {
			try {
				return await fn();
			} catch (error) {
				const isLastAttempt = i === maxRetries - 1;

				// Only retry on quota errors
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
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
		throw new Error("Max retries exceeded");
	};

	try {
		const startTime = performance.now();
		const response = await retryWithBackoff(async () => {
			return await promptChromeAI(session, prompt, {
				responseConstraint: CHUNK_SCHEMA,
			});
		});
		const endTime = performance.now();
		const duration = ((endTime - startTime) / 1000).toFixed(2);
		console.log(
			`Chunking LLM call completed in ${duration}s for ${items.length} items`,
		);

		let parsed: {
			chunks?: Array<{
				startIndex: number;
				endIndex: number;
				description: string;
			}>;
		};
		try {
			parsed = JSON.parse(response);
		} catch (parseError) {
			return {
				timeRanges: createHalfDayChunks(timestamps),
				rawResponse: response,
				error: `Failed to parse JSON: ${parseError}`,
				isFallback: true,
			};
		}

		if (!parsed.chunks || !Array.isArray(parsed.chunks)) {
			return {
				timeRanges: createHalfDayChunks(timestamps),
				rawResponse: response,
				error: "Response missing 'chunks' array",
				isFallback: true,
			};
		}

		// Convert indices to timestamps and validate
		const validChunks: ChunkTimeRange[] = parsed.chunks
			.filter(
				(chunk) =>
					typeof chunk.startIndex === "number" &&
					typeof chunk.endIndex === "number" &&
					chunk.startIndex >= 0 &&
					chunk.endIndex < timestamps.length &&
					chunk.startIndex <= chunk.endIndex &&
					typeof chunk.description === "string",
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
		session.destroy();
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
		const year = date.getFullYear();
		const month = date.getMonth();
		const day = date.getDate();
		const period = date.getHours() < 12 ? "AM" : "PM";
		const key = `${year}-${month}-${day}-${period}`;

		if (!chunks.has(key)) {
			const startTime = new Date(
				year,
				month,
				day,
				period === "AM" ? 0 : 12,
				0,
				0,
				0,
			).getTime();
			const endTime = new Date(
				year,
				month,
				day,
				period === "AM" ? 11 : 23,
				59,
				59,
				999,
			).getTime();
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
			description: `${startDate.toLocaleDateString()} ${period}`,
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
