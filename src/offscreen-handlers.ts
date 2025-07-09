/**
 * Handler functions for offscreen tRPC procedures
 * Separated to avoid circular dependencies
 */

import { offscreenTrpc as trpc } from "./trpc/client";
import type { AnalysisProgress } from "./trpc/schemas";
import { loadAIConfigFromServiceWorker } from "./utils/ai-config";
import { getProvider } from "./utils/ai-provider-factory";
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

// Track active analyses
const activeAnalyses = new Map<string, AbortController>();
let currentAnalysisId: string | null = null;

// Keepalive interval
let keepaliveInterval: number | null = null;

// Start keepalive mechanism
function startKeepalive() {
	if (keepaliveInterval !== null) return;

	keepaliveInterval = window.setInterval(() => {
		trpc._internal.keepalive.mutate().catch(() => {
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
		await trpc._internal.reportProgress.mutate({
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

export async function handleStartAnalysis(input: {
	historyItems: chrome.history.HistoryItem[];
	customPrompts?: {
		systemPrompt?: string;
		chunkPrompt?: string;
		mergePrompt?: string;
	};
	analysisId: string;
	trigger: "manual" | "alarm";
	memorySettings?: { storeWorkflowPatterns: boolean };
}) {
	const { historyItems, customPrompts, analysisId, trigger, memorySettings } =
		input;

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
			memorySettings,
		);

		// Save the updated memory
		await saveMemoryToServiceWorker(result.memory);

		await sendProgress({ phase: "complete" });

		// Send completion message
		await trpc._internal.reportComplete.mutate({
			analysisId,
			result: result,
		});

		return { success: true, message: "Analysis completed" };
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";

		await sendProgress({
			phase: "error",
		});

		// Send error message
		await trpc._internal.reportError.mutate({
			analysisId,
			error: errorMessage,
		});

		throw error;
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
}

export async function handleCancelAnalysis(input: { analysisId: string }) {
	const { analysisId } = input;

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
}

export async function handleInitializeAI() {
	try {
		// Load the AI config to determine which provider to use
		const config = await loadAIConfigFromServiceWorker();
		console.log("[Offscreen] Initializing AI provider:", config.provider);

		// Report initializing status
		await trpc._internal.reportAIStatus.mutate({
			status: "initializing",
		});

		// Get the provider from the factory
		const provider = getProvider(config);

		// Initialize the provider
		await provider.initialize();

		// Check status after initialization
		const status = await provider.getStatus();
		if (status === "available") {
			await trpc._internal.reportAIStatus.mutate({
				status: "available",
			});
		} else {
			await trpc._internal.reportAIStatus.mutate({
				status: "error",
				error: `${provider.getProviderName()} not available`,
			});
		}

		return { success: true };
	} catch (error) {
		console.error("[Offscreen] Failed to initialize AI:", error);
		await trpc._internal.reportAIStatus.mutate({
			status: "error",
			error: error instanceof Error ? error.message : "Unknown error",
		});
		throw error;
	}
}
