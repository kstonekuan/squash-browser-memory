/// <reference types="@types/dom-chromium-ai" />

import { loadAIConfigFromServiceWorker } from "./utils/ai-config";
import { analyzeHistoryItems, type ProgressCallback } from "./utils/analyzer";
import {
	loadMemoryFromServiceWorker,
	saveMemoryToServiceWorker,
} from "./utils/memory";
import {
	cleanupAnalysis,
	handleCancelLogic,
	prepareForNewAnalysis,
	registerAnalysis,
	shouldStopKeepalive,
} from "./utils/message-handlers";
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
	prepareForNewAnalysis(currentAnalysisId, activeAnalyses);

	// Start new analysis
	currentAnalysisId = analysisId;
	const abortController = new AbortController();
	registerAnalysis(analysisId, abortController, activeAnalyses);

	// Start keepalive
	startKeepalive();

	try {
		// Load memory and AI config before analysis
		const memory = await loadMemoryFromServiceWorker();
		const aiConfig = await loadAIConfigFromServiceWorker();

		const result = await analyzeHistoryItems(
			historyItems,
			memory,
			aiConfig,
			customPrompts,
			createProgressCallback(),
			trigger,
			abortController.signal,
		);

		// Save the updated memory
		await saveMemoryToServiceWorker(result.memory);

		await sendProgress({ phase: "complete" });

		// Send completion message
		await sendMessage("offscreen:analysis-complete", {
			analysisId,
			result: result,
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
		currentAnalysisId = cleanupAnalysis(
			analysisId,
			currentAnalysisId,
			activeAnalyses,
		);

		// Stop keepalive if no active analyses
		if (shouldStopKeepalive(activeAnalyses)) {
			stopKeepalive();
		}
	}
});

onMessage("offscreen:cancel", async (message) => {
	const { analysisId } = message.data;

	const result = handleCancelLogic(
		analysisId,
		activeAnalyses,
		currentAnalysisId,
	);
	currentAnalysisId = result.newCurrentAnalysisId;

	// Stop keepalive if no active analyses
	if (result.success && shouldStopKeepalive(activeAnalyses)) {
		stopKeepalive();
	}

	return { success: result.success, error: result.error };
});

// Handle memory operations
onMessage("offscreen:read-memory", async () => {
	const { loadMemoryFromServiceWorker } = await import("./utils/memory");
	const memory = await loadMemoryFromServiceWorker();
	return { memory };
});

onMessage("offscreen:write-memory", async (message) => {
	const { saveMemoryToServiceWorker } = await import("./utils/memory");
	await saveMemoryToServiceWorker(message.data.memory);
	return { success: true };
});

onMessage("offscreen:keepalive", async () => {
	// Just acknowledge keepalive
	return { success: true };
});

console.log("[Offscreen] Document initialized");
