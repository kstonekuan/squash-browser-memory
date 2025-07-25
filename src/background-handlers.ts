/**
 * Handler functions for background tRPC procedures
 * Separated to avoid circular dependencies
 */

import { format } from "date-fns";
import type { Result } from "neverthrow";
import { match } from "ts-pattern";
import { backgroundToOffscreenClient } from "./trpc/client";
import type { AIStatus, AnalysisProgress, TRPCContext } from "./trpc/schemas";
import type {
	AnalysisMemory,
	CustomPrompts,
	FullAnalysisResult,
} from "./types";
import { loadAIConfigFromStorage } from "./utils/ai-config";
import type { AIProviderConfig } from "./utils/ai-interface";
import {
	loadAutoAnalysisSettings,
	saveAutoAnalysisSettings,
} from "./utils/ambient";
import {
	type AlarmAPI,
	cancelAnalysisLogic,
	getAnalysisStateLogic,
	handleAutoAnalysisToggleLogic,
	handleStartupAlarmCheckLogic,
	queryNextAlarmLogic,
	updateProgressMap,
} from "./utils/analysis-operations";
import { broadcast } from "./utils/broadcast";
import * as chromeAPI from "./utils/chrome-api";
import { MIN_HISTORY_ITEMS_FOR_ANALYSIS } from "./utils/constants";
import {
	createEmptyMemory,
	loadMemoryFromStorage,
	saveMemoryToStorage,
} from "./utils/memory";
import { loadMemorySettings } from "./utils/memory-settings";
import {
	CUSTOM_PROMPTS_KEY,
	createChromeStorage,
	getStorageData,
	LAST_ANALYSIS_RESULT_KEY,
	setStorageData,
} from "./utils/storage";

// Track analysis state
let isAnalysisRunning = false;
let currentAnalysisId: string | null = null;

// Store analysis progress for when side panel reopens
const analysisProgressMap = new Map<string, AnalysisProgress>();

// Track active analyses
const activeAnalyses = new Map<string, boolean>();

// Create notification using chrome-api wrapper
async function createNotification(
	title: string,
	message: string,
	type: "success" | "error",
): Promise<void> {
	try {
		const notificationId = `history-analyzer-${Date.now()}`;
		const iconUrl = chrome.runtime.getURL("icon-48.png");

		const notificationResult = await chromeAPI.createNotification(
			notificationId,
			{
				type: "basic",
				iconUrl,
				title,
				message,
				priority: type === "error" ? 2 : 1,
			},
		);

		notificationResult.match(
			// Auto-clear notifications after 10 seconds
			(notificationId) => {
				setTimeout(() => {
					chrome.notifications.clear(notificationId);
				}, 10000);
			},
			(error) => {
				console.error("[Background] Failed to create notification:", error);
			},
		);
	} catch (error) {
		console.error("[Background] Failed to create notification:", error);
	}
}

const ALARM_NAME = "hourly-analysis";

// Chrome API adapters
const chromeAlarmAPI: AlarmAPI = {
	clear: async (name: string) => {
		const result = await chromeAPI.clearAlarm(name);
		if (result.isErr()) throw result.error;
		return result.value;
	},
	create: async (name: string, alarmInfo: chrome.alarms.AlarmCreateInfo) => {
		const result = await chromeAPI.setAlarm(
			name,
			alarmInfo.delayInMinutes || 0,
		);
		if (result.isErr()) throw result.error;
	},
	get: async (name: string) => {
		const result = await chromeAPI.getAlarm(name);
		if (result.isErr()) throw result.error;
		return result.value;
	},
};

// Handler functions for tRPC procedures
export async function handleToggleAutoAnalysis(
	input: { enabled: boolean },
	ctx?: TRPCContext,
) {
	console.log(`[Background] Auto-analysis toggle: ${input.enabled}`, {
		sender: ctx?.sender?.tab?.id ? `tab:${ctx.sender.tab.id}` : "unknown",
		timestamp: ctx?.timestamp,
	});
	return handleAutoAnalysisToggleLogic(
		input.enabled,
		ALARM_NAME,
		chromeAlarmAPI,
	);
}

export async function handleStartManualAnalysis(
	input: {
		timeRange: {
			startTime: number;
			endTime: number;
		};
	},
	ctx?: TRPCContext,
): Promise<
	{ success: true; analysisId: string } | { success: false; error: string }
> {
	const { timeRange } = input;

	console.log(`[Background] Manual analysis requested`, {
		timeRange,
		sender: ctx?.sender?.tab?.id ? `tab:${ctx.sender.tab.id}` : "unknown",
		timestamp: ctx?.timestamp,
	});

	try {
		// Use triggerAnalysis with the time range
		await triggerAnalysis("manual", timeRange);

		// triggerAnalysis sets currentAnalysisId
		return {
			success: true,
			analysisId: currentAnalysisId || `manual-${Date.now()}`,
		};
	} catch (error) {
		console.error("[Background] Manual analysis failed:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

export async function handleCancelAnalysis(
	input: {
		analysisId: string;
	},
	ctx?: TRPCContext,
): Promise<{ success: boolean; error?: string }> {
	console.log(`[Background] Cancel analysis requested`, {
		analysisId: input.analysisId,
		sender: ctx?.sender?.tab?.id ? `tab:${ctx.sender.tab.id}` : "unknown",
		timestamp: ctx?.timestamp,
	});

	const { shouldCancel, error } = cancelAnalysisLogic(
		currentAnalysisId,
		input.analysisId,
		activeAnalyses,
	);

	if (!shouldCancel) {
		return { success: false, error };
	}

	// Send cancel message to offscreen document
	if (activeAnalyses.has(input.analysisId)) {
		try {
			// Ensure offscreen document exists
			const contexts = await chrome.runtime.getContexts({
				contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
			});

			if (contexts.length > 0) {
				await backgroundToOffscreenClient.offscreen.cancelAnalysis.mutate({
					analysisId: input.analysisId,
				});
			}

			activeAnalyses.delete(input.analysisId);
			return { success: true };
		} catch (error) {
			console.error("[Background] Failed to cancel analysis:", error);
			return { success: false, error: "Failed to send cancel message" };
		}
	} else {
		return { success: false, error: "Analysis not found" };
	}
}

export function handleGetAnalysisState() {
	return getAnalysisStateLogic(
		isAnalysisRunning,
		currentAnalysisId,
		analysisProgressMap,
	);
}

export function handleQueryStatus() {
	return { isRunning: isAnalysisRunning };
}

export async function handleQueryNextAlarm() {
	return queryNextAlarmLogic(ALARM_NAME, chromeAlarmAPI);
}

export async function handleInitializeAI() {
	console.log("[Background] Initializing AI provider");
	const result = await chromeAPI.ensureOffscreenDocument();
	if (result.isErr()) {
		throw result.error;
	}
	// Forward the message to the offscreen document
	await backgroundToOffscreenClient.offscreen.initializeAI.mutate();
}

export async function handleGetAIConfig(): Promise<AIProviderConfig> {
	return loadAIConfigFromStorage();
}

export async function handleReadMemory() {
	const memory = await loadMemoryFromStorage();
	return { memory };
}

export async function handleWriteMemory(
	input: { memory: AnalysisMemory },
	ctx?: TRPCContext,
) {
	try {
		// Ensure the memory object has the required structure
		const emptyMemory = createEmptyMemory();
		const memory: AnalysisMemory = {
			...emptyMemory,
			...input.memory,
		};

		await saveMemoryToStorage(memory);
		return { success: true };
	} catch (error) {
		console.error("[Background] Failed to write memory:", {
			error: error instanceof Error ? error.message : String(error),
			context: ctx,
			inputMemory: input,
		});
		throw error; // Re-throw to maintain error propagation
	}
}

export async function handleClearPatterns() {
	try {
		const memory = await loadMemoryFromStorage();
		if (memory) {
			memory.patterns = [];
			await saveMemoryToStorage(memory);
		}
		return { success: true };
	} catch (error) {
		console.error("Failed to clear patterns:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

// Reporting handlers (called by offscreen document)
export async function handleProgressReport(
	input: AnalysisProgress,
): Promise<{ success: boolean }> {
	// Store progress for state queries
	if (input.analysisId) {
		updateProgressMap(input.analysisId, input, analysisProgressMap);
	}

	// Broadcast progress to all subscribers
	broadcast.analysisProgress(input);

	return { success: true };
}

export async function handleCompleteReport(input: {
	analysisId: string;
	result: FullAnalysisResult;
}): Promise<{ success: boolean }> {
	const { analysisId, result } = input;

	// Save results to storage
	const storage = createChromeStorage();
	if (storage) {
		await setStorageData(storage, LAST_ANALYSIS_RESULT_KEY, result);
	}

	// Update state
	if (currentAnalysisId === analysisId) {
		isAnalysisRunning = false;
		currentAnalysisId = null;
	}
	activeAnalyses.delete(analysisId);

	console.log(
		"[Background] Analysis completed:",
		analysisId,
		`${result.stats.totalUrls} URLs analyzed`,
	);
	return { success: true };
}

export async function handleErrorReport(input: {
	analysisId: string;
	error: string;
}): Promise<{ success: boolean }> {
	const { analysisId, error } = input;

	// Update state
	if (currentAnalysisId === analysisId) {
		isAnalysisRunning = false;
		currentAnalysisId = null;
	}
	activeAnalyses.delete(analysisId);

	console.error("[Background] Analysis error:", analysisId, error);
	return { success: true };
}

export async function handleAIStatusReport(
	input: AIStatus,
): Promise<{ success: boolean }> {
	// Broadcast AI status to all subscribers
	broadcast.aiStatus(input);

	return { success: true };
}

// Run analysis function
async function runAnalysis(
	historyItems: chrome.history.HistoryItem[],
	analysisId: string,
): Promise<void> {
	console.log(
		`[Background] Starting analysis for ${historyItems.length} items with ID: ${analysisId}`,
	);

	activeAnalyses.set(analysisId, true);

	try {
		// Load prompts and memory settings from storage
		const storage = createChromeStorage();
		let customPrompts: CustomPrompts | undefined;
		if (storage) {
			const promptsResult = await getStorageData(storage, CUSTOM_PROMPTS_KEY);
			if (promptsResult.isOk() && promptsResult.value) {
				customPrompts = promptsResult.value;
			}
		}

		const memorySettings = await loadMemorySettings();

		// Ensure offscreen document exists
		const offscreenResult = await chromeAPI.ensureOffscreenDocument();
		if (offscreenResult.isErr()) {
			throw offscreenResult.error;
		}

		// Send analysis request to offscreen document
		const result =
			await backgroundToOffscreenClient.offscreen.startAnalysis.mutate({
				historyItems,
				customPrompts,
				analysisId,
				memorySettings,
			});

		console.log("[Background] Analysis started successfully:", result);

		broadcast.analysisStatus({
			status: "completed",
			message: `Analysis completed successfully for ${historyItems.length} items`,
			itemCount: historyItems.length,
		});

		// Update settings and send notification
		const settings = await loadAutoAnalysisSettings();
		await saveAutoAnalysisSettings({
			...settings,
			lastRunTimestamp: new Date(),
			lastRunStatus: "success",
			lastRunError: undefined, // Clear any previous error
		});

		if (settings.notifyOnSuccess) {
			await createNotification(
				"History Analysis Complete",
				`Successfully analyzed ${historyItems.length} items`,
				"success",
			);
		}
	} catch (error) {
		console.error(`[Background] Analysis error:`, error);

		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";

		// Handle different error types
		await match(error)
			.with({ message: "Analysis cancelled" }, async () => {
				broadcast.analysisStatus({
					status: "error",
					error: "Analysis cancelled",
					message: "Analysis was cancelled by user",
				});
			})
			.otherwise(async () => {
				broadcast.analysisStatus({
					status: "error",
					error: errorMessage,
					message: `Analysis failed: ${errorMessage}`,
				});

				// Update settings and send notification
				const settings = await loadAutoAnalysisSettings();
				await saveAutoAnalysisSettings({
					...settings,
					lastRunTimestamp: new Date(),
					lastRunStatus: "error",
					lastRunError: errorMessage,
				});

				if (settings.notifyOnError) {
					await createNotification(
						"History Analysis Failed",
						`Analysis encountered an error: ${errorMessage}`,
						"error",
					);
				}
			});

		throw error;
	} finally {
		activeAnalyses.delete(analysisId);
		if (currentAnalysisId === analysisId) {
			currentAnalysisId = null;
			isAnalysisRunning = false;
		}

		// Schedule next analysis in 1 hour if auto-analysis is enabled
		const settings = await loadAutoAnalysisSettings();
		if (settings.enabled) {
			await chromeAlarmAPI.clear(ALARM_NAME);
			await chromeAlarmAPI.create(ALARM_NAME, {
				delayInMinutes: 60,
			});
			console.log("[Background] Next analysis scheduled in 1 hour");
		}
	}
}

// Export functions needed by background.ts
export async function triggerAnalysis(
	trigger: "manual" | "alarm",
	timeRange?: { startTime: number; endTime: number },
) {
	console.log(`[Analysis] Triggered by: ${trigger}`);

	// Check if analysis is already running
	if (isAnalysisRunning) {
		console.log("[Analysis] Analysis already in progress, skipping.");

		// Reschedule to try again in 60 minutes
		const settings = await loadAutoAnalysisSettings();
		if (settings.enabled) {
			await chromeAlarmAPI.clear(ALARM_NAME);
			await chromeAlarmAPI.create(ALARM_NAME, {
				delayInMinutes: 60,
			});
			console.log("[Analysis] Rescheduled alarm for next hour");
		}

		await broadcast.analysisStatus({
			status: "skipped",
			reason: "analysis-already-running",
			message: "Analysis is already in progress",
		});
		return;
	}

	const settings = await loadAutoAnalysisSettings();

	// For alarm triggers, check if auto-analysis is enabled
	if (trigger === "alarm" && !settings.enabled) {
		console.log(
			"[Analysis] Auto-analysis is disabled, skipping alarm trigger.",
		);
		return;
	}

	try {
		// Determine time range based on trigger
		let historyResult: Result<chrome.history.HistoryItem[], Error>;

		if (trigger === "manual") {
			// For manual trigger, use provided time range or default to last hour
			if (!timeRange) {
				throw new Error("Time range is required for manual trigger");
			}
			historyResult = await chromeAPI.searchHistory({
				text: "",
				startTime: timeRange.startTime,
				endTime: timeRange.endTime,
				maxResults: 5000,
			});
		} else {
			// For alarm trigger, get history since last analysis
			const memory = await loadMemoryFromStorage();
			const lastTimestamp = memory?.lastHistoryTimestamp || 0;

			console.log(
				`[Analysis] Last analyzed timestamp: ${
					lastTimestamp > 0
						? format(new Date(lastTimestamp), "yyyy-MM-dd'T'HH:mm:ss'Z'")
						: "never"
				}`,
			);

			const searchStartTime =
				lastTimestamp > 0 ? lastTimestamp + 1 : Date.now() - 60 * 60 * 1000;

			historyResult = await chromeAPI.searchHistory({
				text: "",
				startTime: searchStartTime,
				endTime: Date.now(),
				maxResults: 5000,
			});
		}

		if (historyResult.isErr()) {
			throw historyResult.error;
		}
		const historyItems = historyResult.value;

		console.log(
			`[Analysis] Found ${historyItems.length} history items to analyze`,
		);

		// Check minimum history items
		if (historyItems.length < MIN_HISTORY_ITEMS_FOR_ANALYSIS) {
			console.log(
				`[Analysis] Insufficient history items (${historyItems.length} < ${MIN_HISTORY_ITEMS_FOR_ANALYSIS})`,
			);

			const message =
				historyItems.length === 0
					? "No browsing history to analyze"
					: `Need at least ${MIN_HISTORY_ITEMS_FOR_ANALYSIS} history items for meaningful analysis (found ${historyItems.length})`;

			await saveAutoAnalysisSettings({
				...settings,
				lastRunTimestamp: new Date(),
				lastRunStatus: "success",
			});

			isAnalysisRunning = false;
			await broadcast.analysisStatus({
				status: "skipped",
				reason:
					historyItems.length === 0 ? "no-new-history" : "insufficient-history",
				message,
			});
			return;
		}

		isAnalysisRunning = true;
		broadcast.analysisStatus({
			status: "running",
			message: "Analyzing new browsing history...",
		});

		// Run analysis in service worker
		console.log("[Analysis] Running analysis in service worker");

		const analysisId = `analysis-${Date.now()}`;
		currentAnalysisId = analysisId;
		await runAnalysis(historyItems, analysisId);
	} catch (error) {
		// Error already handled and logged by runAnalysis
		console.error("[Analysis] Error in triggerAnalysis:", error);
		isAnalysisRunning = false;
	}
}

export async function handleStartupAlarmCheck() {
	await handleStartupAlarmCheckLogic(ALARM_NAME, chromeAlarmAPI);
}

export async function handleVerifyAlarmHealth(): Promise<{
	healthy: boolean;
	recreated: boolean;
}> {
	const settings = await loadAutoAnalysisSettings();
	if (!settings.enabled) {
		return { healthy: true, recreated: false };
	}

	const alarm = await chromeAlarmAPI.get(ALARM_NAME);
	if (!alarm) {
		console.log("[Alarm Health] Missing alarm detected, recreating...");
		await chromeAlarmAPI.clear(ALARM_NAME);
		await chromeAlarmAPI.create(ALARM_NAME, {
			delayInMinutes: 60,
		});
		return { healthy: false, recreated: true };
	}

	return { healthy: true, recreated: false };
}
