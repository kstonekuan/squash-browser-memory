/// <reference types="@types/dom-chromium-ai" />

import { analyzeHistoryItems, type ProgressCallback } from "./utils/analyzer";
import type { AnalysisProgress } from "./utils/messaging";
import { onMessage, sendMessage } from "./utils/messaging";

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

// Create a progress callback that sends updates via sendProgress
function createProgressCallback(): ProgressCallback {
	return async (info) => {
		await sendProgress(info);
	};
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
			createProgressCallback(),
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

// Handle memory operations
onMessage("offscreen:read-memory", async () => {
	const { loadMemory } = await import("./utils/memory");
	const memory = await loadMemory();
	return { memory };
});

onMessage("offscreen:write-memory", async (message) => {
	const { saveMemory } = await import("./utils/memory");
	await saveMemory(message.data.memory);
	return { success: true };
});

onMessage("offscreen:keepalive", async () => {
	// Just acknowledge keepalive
	return { success: true };
});

console.log("[Offscreen] Document initialized");
