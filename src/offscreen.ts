// Offscreen document for running background analysis
// This allows us to use ES6 modules and complex analysis logic in the background

import type { CustomPrompts } from "./utils/analyzer";
import { analyzeHistoryItems } from "./utils/analyzer";
import { loadMemory } from "./utils/memory";
import { onMessage, sendMessage } from "./utils/messaging";

console.log("[Offscreen] Document loaded and ready for analysis");

// Track active analyses
const activeAnalyses = new Map<string, AbortController>();

// Handle analysis requests from background
onMessage("analysis:run-in-offscreen", async (message) => {
	const data = message.data;

	const abortController = new AbortController();
	activeAnalyses.set(data.analysisId, abortController);

	try {
		await runAnalysis(
			data.historyItems,
			data.customPrompts,
			data.analysisId,
			abortController.signal,
		);

		// Send result back to background
		await sendMessage("analysis:offscreen-result", {
			success: true,
			itemCount: data.historyItems.length,
			analysisId: data.analysisId,
		});
	} catch (error) {
		// Check if it was cancelled
		if (error instanceof Error && error.name === "AbortError") {
			await sendMessage("analysis:offscreen-result", {
				success: false,
				cancelled: true,
				error: "Analysis cancelled",
				analysisId: data.analysisId,
			});
		} else {
			await sendMessage("analysis:offscreen-result", {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
				analysisId: data.analysisId,
			});
		}
	} finally {
		activeAnalyses.delete(data.analysisId);
	}
});

// Handle cancellation requests
onMessage("analysis:cancel", async (message) => {
	const data = message.data;
	const abortController = activeAnalyses.get(data.analysisId);

	if (abortController) {
		console.log("[Offscreen] Cancelling analysis:", data.analysisId);
		abortController.abort();
		activeAnalyses.delete(data.analysisId);
		return { success: true };
	} else {
		console.log(
			"[Offscreen] No active analysis found for ID:",
			data.analysisId,
		);
		return { success: false, error: "Analysis not found" };
	}
});

async function runAnalysis(
	historyItems: chrome.history.HistoryItem[],
	customPrompts?: CustomPrompts,
	analysisId?: string,
	abortSignal?: AbortSignal,
): Promise<{
	success: boolean;
	itemCount: number;
	error?: string;
	cancelled?: boolean;
}> {
	try {
		// Run the analysis with progress callbacks
		const result = await analyzeHistoryItems(
			historyItems,
			customPrompts,
			// Progress callback that sends updates to background
			async (info) => {
				console.log(`[Offscreen] Analysis progress: ${info.phase}`, info);

				// Send progress update to background
				if (analysisId) {
					try {
						await sendMessage("analysis:progress", {
							analysisId,
							phase: info.phase,
							subPhase: info.subPhase,
							chunkProgress:
								info.currentChunk !== undefined &&
								info.totalChunks !== undefined
									? {
											current: info.currentChunk,
											total: info.totalChunks,
											description: info.chunkDescription || "",
										}
									: info.chunkDescription && !info.currentChunk
										? {
												current: 0,
												total: 0,
												description: info.chunkDescription,
											}
										: undefined,
							retryMessage: info.retryMessage,
						});
					} catch (err) {
						console.error("[Offscreen] Failed to send progress update:", err);
					}
				}
			},
			abortSignal,
		);

		console.log("[Offscreen] Analysis result:", result);

		// Update the last analyzed timestamp in memory
		const memory = await loadMemory();
		if (memory && historyItems.length > 0) {
			const mostRecentTimestamp = Math.max(
				...historyItems
					.map((item) => item.lastVisitTime || 0)
					.filter((time) => time > 0),
			);

			if (mostRecentTimestamp > 0) {
				memory.lastHistoryTimestamp = mostRecentTimestamp;
				await chrome.storage.local.set({
					history_analysis_memory: memory,
				});
				console.log(
					"[Offscreen] Updated last analyzed timestamp to",
					new Date(mostRecentTimestamp).toISOString(),
				);
			}
		}

		return {
			success: true,
			itemCount: historyItems.length,
		};
	} catch (error) {
		console.error("[Offscreen] Analysis error:", error);

		if (error instanceof Error && error.name === "AbortError") {
			return {
				success: false,
				itemCount: historyItems.length,
				cancelled: true,
				error: "Analysis cancelled",
			};
		}

		return {
			success: false,
			itemCount: historyItems.length,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}
