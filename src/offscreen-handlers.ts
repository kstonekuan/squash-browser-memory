/**
 * Handler functions for offscreen tRPC procedures
 * Separated to avoid circular dependencies
 */

import { offscreenToBackgroundClient } from "./trpc/client";
import type { AnalysisProgress, ProviderStatusResult } from "./trpc/schemas";
import {
	getClaudeApiKey,
	getGeminiApiKey,
	loadAIConfigFromServiceWorker,
} from "./utils/ai-config";
import type {
	AIProvider,
	AIProviderConfig,
	AIProviderStatus,
	AIProviderType,
} from "./utils/ai-interface";
import { createProvider } from "./utils/ai-provider-factory";
import {
	cleanupAnalysis,
	handleCancelLogic,
	prepareForNewAnalysis,
	registerAnalysis,
	shouldStopKeepalive,
} from "./utils/analysis-operations";
import { analyzeHistoryItems, type ProgressCallback } from "./utils/analyzer";
import {
	loadMemoryFromServiceWorker,
	saveMemoryToServiceWorker,
} from "./utils/memory";

// Track active analyses
const activeAnalyses = new Map<string, AbortController>();
let currentAnalysisId: string | null = null;

// Track initialized AI providers
const initializedProviders = new Map<AIProviderType, AIProvider>();

// Keepalive interval
let keepaliveInterval: number | null = null;

// Start keepalive mechanism
function startKeepalive() {
	if (keepaliveInterval !== null) return;

	keepaliveInterval = setInterval(() => {
		offscreenToBackgroundClient._internal.keepalive.mutate().catch(() => {
			// Service worker might be inactive, ignore error
		});
	}, 20000) as unknown as number; // Every 20 seconds
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
		await offscreenToBackgroundClient._internal.reportProgress.mutate({
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
	const { historyItems, customPrompts, analysisId, memorySettings } = input;

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
			abortController.signal,
			memorySettings,
		);

		// Save the updated memory
		await saveMemoryToServiceWorker(result.memory);

		await sendProgress({ phase: "complete" });

		// Send completion message
		await offscreenToBackgroundClient._internal.reportComplete.mutate({
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
		await offscreenToBackgroundClient._internal.reportError.mutate({
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
		await offscreenToBackgroundClient._internal.reportAIStatus.mutate({
			status: "initializing",
		});

		// Check if we already have this provider initialized
		let provider = initializedProviders.get(config.provider);

		if (!provider) {
			// Create a new provider instance from the factory
			provider = createProvider(config);
			// Store it for reuse
			initializedProviders.set(config.provider, provider);
		}

		// Check status before initialization
		const preInitStatus = await provider.getStatus();

		if (preInitStatus === "needs-configuration") {
			// Report needs configuration status
			await offscreenToBackgroundClient._internal.reportAIStatus.mutate({
				status: "error",
				error: `${provider.getProviderName()} requires API key configuration`,
			});
			return { success: false };
		}

		// Try to initialize the provider
		await provider.initialize();

		// Check status after initialization
		const status = await provider.getStatus();
		if (status === "available") {
			await offscreenToBackgroundClient._internal.reportAIStatus.mutate({
				status: "available",
			});
		} else {
			await offscreenToBackgroundClient._internal.reportAIStatus.mutate({
				status: "error",
				error: `${provider.getProviderName()} not available`,
			});
		}

		return { success: true };
	} catch (error) {
		console.error("[Offscreen] Failed to initialize AI:", error);
		await offscreenToBackgroundClient._internal.reportAIStatus.mutate({
			status: "error",
			error: error instanceof Error ? error.message : "Unknown error",
		});
		throw error;
	}
}

// Handle API key changes by clearing the affected provider
export async function handleApiKeyChange(providerType: AIProviderType) {
	console.log(
		`[Offscreen] API key changed for ${providerType}, clearing from cache`,
	);
	initializedProviders.delete(providerType);
	return { success: true };
}

export async function handleCheckAllProvidersStatus(): Promise<ProviderStatusResult> {
	try {
		const results = new Map<AIProviderType, AIProviderStatus>();
		const providerTypes: AIProviderType[] = ["chrome", "claude", "gemini"];

		console.log("[Offscreen] Checking status for all providers");

		for (const providerType of providerTypes) {
			try {
				// First check if we have an existing initialized provider
				const existingProvider = initializedProviders.get(providerType);

				if (existingProvider) {
					// Use the existing provider's status
					const status = await existingProvider.getStatus();
					results.set(providerType, status);
					console.log(
						`[Offscreen] Using existing ${providerType} provider, status: ${status}`,
					);
				} else {
					// Only create new instance if we don't have one
					// For API-based providers, we need to load their specific keys
					let config = await loadAIConfigFromServiceWorker();

					if (providerType === "claude") {
						const claudeKey = await getClaudeApiKey();
						if (!claudeKey) {
							results.set(providerType, "needs-configuration");
							continue;
						}
						// Create config with the key
						config = { provider: "claude", claudeApiKey: claudeKey };
					} else if (providerType === "gemini") {
						const geminiKey = await getGeminiApiKey();
						if (!geminiKey) {
							results.set(providerType, "needs-configuration");
							continue;
						}
						// Create config with the key
						config = { provider: "gemini", geminiApiKey: geminiKey };
					}

					// Create a test config for this provider type
					const testConfig: AIProviderConfig = {
						...config,
						provider: providerType,
					} as AIProviderConfig;

					const provider = createProvider(testConfig);

					// For Chrome AI, try to initialize to check availability
					if (providerType === "chrome") {
						try {
							await provider.initialize();
							const status = await provider.getStatus();
							results.set(providerType, status);
							// Don't store this test instance
						} catch (error) {
							console.log(`[Offscreen] Chrome AI not available:`, error);
							results.set(providerType, "unavailable");
						}
					} else {
						// For API providers, just check status
						const status = await provider.getStatus();
						results.set(providerType, status);
					}
				}

				console.log(
					`[Offscreen] Provider ${providerType} status: ${results.get(providerType)}`,
				);
			} catch (error) {
				console.error(
					`[Offscreen] Failed to check ${providerType} status:`,
					error,
				);
				results.set(providerType, "error");
			}
		}

		return {
			type: "success",
			statuses: Object.fromEntries(results),
		};
	} catch (error) {
		console.error(
			"[Offscreen] Critical error checking provider statuses:",
			error,
		);
		return {
			type: "error",
			message:
				error instanceof Error
					? error.message
					: "Unknown error checking provider statuses",
		};
	}
}
