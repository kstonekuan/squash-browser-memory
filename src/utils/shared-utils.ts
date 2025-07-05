/**
 * Shared utilities used across multiple modules
 */

import { jsonrepair } from "jsonrepair";

/**
 * Extract JSON from markdown-wrapped or mixed content responses
 */
export function extractJSONFromResponse(response: string): string {
	const responseTrimmed = response.trim();
	try {
		// jsonrepair can handle many cases, but not markdown code blocks
		// Check for markdown first since it's common in LLM responses
		const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
		const match = responseTrimmed.match(codeBlockRegex);

		if (match) {
			// Extract from markdown and repair
			return jsonrepair(match[1].trim());
		}

		// Let jsonrepair handle everything else
		return jsonrepair(responseTrimmed);
	} catch (error) {
		console.error("Failed to repair JSON:", error);
		return responseTrimmed;
	}
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
