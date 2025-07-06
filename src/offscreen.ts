/// <reference types="@types/dom-chromium-ai" />

import { loadAIConfigFromServiceWorker } from "./utils/ai-config";
import type { AIProvider } from "./utils/ai-interface";
import { getProvider, setChromeProvider } from "./utils/ai-provider-factory";
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

// Chrome AI provider instance
let chromeAIProvider: AIProvider | null = null;
let isInitializingChromeAI = false;

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

		// If using Chrome AI and we have an initialized instance, update the factory
		if (aiConfig.provider === "chrome" && chromeAIProvider) {
			// Use our already initialized Chrome AI provider
			setChromeProvider(chromeAIProvider);
		}

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

// Handle Chrome AI initialization
onMessage("offscreen:initialize-chrome-ai", async () => {
	if (isInitializingChromeAI || chromeAIProvider) {
		console.log("[Offscreen] Chrome AI already initialized or initializing");
		return;
	}

	isInitializingChromeAI = true;

	try {
		await sendMessage("offscreen:chrome-ai-status", {
			status: "initializing",
		});

		const config = await loadAIConfigFromServiceWorker();
		if (config.provider !== "chrome") {
			throw new Error("Not using Chrome AI provider");
		}

		chromeAIProvider = getProvider(config);

		// Check if Chrome AI is already downloading
		if (typeof LanguageModel !== "undefined") {
			const availability = await LanguageModel.availability();
			if (availability === "downloading") {
				// Already downloading, just wait for it to complete
				await sendMessage("offscreen:chrome-ai-status", {
					status: "downloading",
				});

				// Initialize to wait for download to complete
				await chromeAIProvider.initialize();

				// Download should be complete now
				await sendMessage("offscreen:chrome-ai-status", {
					status: "available",
				});
				return;
			}
		}

		// Initialize without progress callback
		await chromeAIProvider.initialize();

		// Check if it needs download
		if (chromeAIProvider.needsDownload?.()) {
			// Model needs to be downloaded, send error status with needs-download message
			await sendMessage("offscreen:chrome-ai-status", {
				status: "error",
				error: "needs-download",
			});
		} else {
			await sendMessage("offscreen:chrome-ai-status", {
				status: "available",
			});
		}
	} catch (error) {
		console.error("[Offscreen] Failed to initialize Chrome AI:", error);
		await sendMessage("offscreen:chrome-ai-status", {
			status: "error",
			error: error instanceof Error ? error.message : "Unknown error",
		});
		chromeAIProvider = null;
	} finally {
		isInitializingChromeAI = false;
	}
});

// Handle Chrome AI download trigger
onMessage("offscreen:trigger-chrome-ai-download", async () => {
	if (!chromeAIProvider || !chromeAIProvider.triggerModelDownload) {
		console.error("[Offscreen] No Chrome AI provider or download trigger");
		return;
	}

	try {
		await sendMessage("offscreen:chrome-ai-status", {
			status: "downloading",
		});

		await chromeAIProvider.triggerModelDownload();

		await sendMessage("offscreen:chrome-ai-status", {
			status: "available",
		});
	} catch (error) {
		console.error("[Offscreen] Failed to download Chrome AI model:", error);
		await sendMessage("offscreen:chrome-ai-status", {
			status: "error",
			error: error instanceof Error ? error.message : "Download failed",
		});
	}
});

console.log("[Offscreen] Document initialized");
