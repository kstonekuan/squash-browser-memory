/**
 * Shared utilities used across multiple modules
 */

/**
 * Extract JSON from markdown-wrapped or mixed content responses
 */
export function extractJSONFromResponse(response: string): string {
	// Remove markdown code fences if present
	const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
	const match = response.match(codeBlockRegex);

	if (match) {
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
		return extractedJson;
	}

	// Return as-is if no extraction needed
	return response.trim();
}

/**
 * Retry a function with exponential backoff on quota errors
 */
export async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	maxRetries = 3,
	baseDelay = 2000,
	onProgress?: (retryMessage: string) => void,
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
				onProgress(retryMessage);
			}

			// Check if already aborted before waiting
			if (abortSignal?.aborted) {
				throw new Error("Operation cancelled");
			}

			// Wait with abort support
			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(resolve, delay);

				if (abortSignal) {
					const abortHandler = () => {
						clearTimeout(timeout);
						reject(new Error("Operation cancelled during retry"));
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

/**
 * Get the most recent timestamp from a list of history items
 */
export function getMostRecentTimestamp(
	items: chrome.history.HistoryItem[],
): number {
	const timestamps = items
		.map((item) => item.lastVisitTime || 0)
		.filter((time) => time > 0);

	return timestamps.length > 0 ? Math.max(...timestamps) : 0;
}

/**
 * Calculate optimal chunk size for items using binary search
 */
export async function calculateOptimalChunkSize(
	items: chrome.history.HistoryItem[],
	maxTokens: number,
	measureTokens: (items: chrome.history.HistoryItem[]) => Promise<number>,
	estimateTokensPerItem: number = 50,
	abortSignal?: AbortSignal,
): Promise<number> {
	let left = 1;
	let right = items.length;
	let optimalSize = 1;

	while (left <= right) {
		if (abortSignal?.aborted) {
			throw new Error("Operation cancelled");
		}

		const mid = Math.floor((left + right) / 2);
		const testItems = items.slice(0, mid);

		try {
			const tokenCount = await measureTokens(testItems);
			console.log(`Testing ${mid} items: ${tokenCount} tokens`);

			if (tokenCount <= maxTokens) {
				optimalSize = mid;
				left = mid + 1;
			} else {
				right = mid - 1;
			}
		} catch {
			// If measurement fails, use estimation
			const estimatedTokens = mid * estimateTokensPerItem;
			console.log(`Estimating ${mid} items = ${estimatedTokens} tokens`);

			if (estimatedTokens <= maxTokens) {
				optimalSize = mid;
				left = mid + 1;
			} else {
				right = mid - 1;
			}
		}
	}

	return optimalSize;
}
