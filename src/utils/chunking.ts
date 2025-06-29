import { createChromeAISession } from "./chrome-ai";
import { DEFAULT_CHUNK_SYSTEM_PROMPT } from "./constants";
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

	// Create a concise prompt for chunk identification to avoid token limits
	// Limit number of timestamps to avoid exceeding 1024 token limit
	const MAX_TIMESTAMPS = 100;
	const timestampsToAnalyze = timestamps.slice(0, MAX_TIMESTAMPS);

	const prompt = `Group these ${timestampsToAnalyze.length} timestamps into browsing sessions.
${timestampsToAnalyze.length < timestamps.length ? `(Analyzing first ${MAX_TIMESTAMPS} of ${timestamps.length} total)` : ""}

Timestamps with their millisecond values:
${timestampsToAnalyze
	.map((ts) => {
		const d = new Date(ts);
		return `${ts} = ${d.toLocaleDateString()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
	})
	.join("\n")}

Rules:
- Gap >30min = new session
- Sessions can span days if continuous
- Return at least 1 chunk
- Use descriptive labels

IMPORTANT: Return startTime and endTime as the exact millisecond timestamps from the list above (the numbers before the = sign).`;

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
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
		throw new Error("Max retries exceeded");
	};

	try {
		const response = await retryWithBackoff(async () => {
			return await session.prompt(prompt, {
				responseConstraint: CHUNK_SCHEMA,
			});
		});

		let parsed: { chunks?: ChunkTimeRange[] };
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

		// Validate and clean up chunks
		const validChunks: ChunkTimeRange[] = parsed.chunks
			.filter(
				(chunk: ChunkTimeRange) =>
					typeof chunk.startTime === "number" &&
					typeof chunk.endTime === "number" &&
					chunk.startTime < chunk.endTime,
			)
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
