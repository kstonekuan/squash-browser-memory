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
			const extracted = match[1].trim();
			console.log(
				"[extractJSON] Found markdown code block, extracted length:",
				extracted.length,
			);
			const repaired = jsonrepair(extracted);
			console.log("[extractJSON] After repair, length:", repaired.length);
			return repaired;
		}

		// Let jsonrepair handle everything else
		console.log(
			"[extractJSON] No markdown block found, attempting direct repair on",
			responseTrimmed.length,
			"chars",
		);
		const repaired = jsonrepair(responseTrimmed);
		console.log("[extractJSON] After repair, length:", repaired.length);
		return repaired;
	} catch (error) {
		console.error("Failed to repair JSON:", error);
		console.error(
			"[extractJSON] First 500 chars of response:",
			responseTrimmed.substring(0, 500),
		);
		console.error(
			"[extractJSON] Last 500 chars of response:",
			responseTrimmed.substring(responseTrimmed.length - 500),
		);
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

/**
 * Hide tracking URL parameters (copied from analyzer.ts)
 */
export function hideTrackingParams(
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

/**
 * Parse a URL and extract domain, path, and params with tracking params hidden
 */
export function parseHistoryItemUrl(item: chrome.history.HistoryItem): {
	d: string;
	p: string;
	q?: Record<string, string>;
	t: string;
	ts: number;
	v: number;
} {
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
}
