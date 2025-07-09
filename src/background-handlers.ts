/**
 * Handler functions for background tRPC procedures
 * Separated to avoid circular dependencies
 */

import { format } from "date-fns";
import { match } from "ts-pattern";
import { offscreenClient } from "./trpc/client";
import type { AnalysisProgress } from "./trpc/schemas";
import type { AnalysisMemory } from "./types";
import type { AIProviderConfig } from "./utils/ai-interface";
import {
	loadAutoAnalysisSettings,
	saveAutoAnalysisSettings,
} from "./utils/ambient";
import * as chromeAPI from "./utils/chrome-api";
import { loadMemoryFromStorage, saveMemoryToStorage } from "./utils/memory";
import {
	type AlarmAPI,
	cancelAnalysisLogic,
	checkAnalysisRunningLogic,
	getAnalysisStateLogic,
	handleAutoAnalysisToggleLogic,
	handleStartupAlarmCheckLogic,
	queryNextAlarmLogic,
	updateProgressMap,
} from "./utils/message-handlers";

// Track analysis state
let isAnalysisRunning = false;
let currentAnalysisId: string | null = null;

// Store analysis progress for when side panel reopens
const analysisProgressMap = new Map<string, AnalysisProgress>();

// Track active analyses
const activeAnalyses = new Map<string, boolean>();

// Status subscribers for broadcasting
type StatusUpdate = {
	status: "started" | "completed" | "error" | "skipped";
	message?: string;
	itemCount?: number;
	reason?: string;
	error?: string;
};

const statusSubscribers = new Set<(update: StatusUpdate) => void>();

// Register a status subscriber
export function subscribeToStatus(
	callback: (update: StatusUpdate) => void,
): () => void {
	statusSubscribers.add(callback);
	return () => {
		statusSubscribers.delete(callback);
	};
}

// Broadcast analysis status to all subscribers
function broadcastAnalysisStatus(
	status: "started" | "completed" | "error" | "skipped",
	details: {
		message?: string;
		itemCount?: number;
		reason?: string;
		error?: string;
	},
): void {
	const update: StatusUpdate = {
		status,
		...details,
	};

	statusSubscribers.forEach((callback) => {
		try {
			callback(update);
		} catch (error) {
			console.error("[Background] Error in status subscriber:", error);
		}
	});

	console.log("[Background] Broadcast status:", status, details);
}

// Create notification using chrome-api wrapper
async function createNotification(
	title: string,
	message: string,
	type: "success" | "error",
): Promise<void> {
	try {
		const notificationId = `history-analyzer-${Date.now()}`;
		const iconUrl = chrome.runtime.getURL("icon-48.png");

		await chromeAPI.createNotification(notificationId, {
			type: "basic",
			iconUrl,
			title,
			message,
			priority: type === "error" ? 2 : 1,
		});

		// Auto-clear success notifications after 10 seconds
		if (type === "success") {
			setTimeout(() => {
				chrome.notifications.clear(notificationId);
			}, 10000);
		}
	} catch (error) {
		console.error("[Background] Failed to create notification:", error);
	}
}

const ALARM_NAME = "hourly-analysis";

// Chrome API adapters
const chromeAlarmAPI: AlarmAPI = {
	clear: (name: string) => chromeAPI.clearAlarm(name),
	create: (name: string, alarmInfo: chrome.alarms.AlarmCreateInfo) =>
		chromeAPI.setAlarm(name, alarmInfo.delayInMinutes || 0),
	get: (name: string) => chromeAPI.getAlarm(name),
};

async function ensureOffscreenDocument(): Promise<void> {
	// Use the chrome-api wrapper which handles the state management
	await chromeAPI.ensureOffscreenDocument();
}

// Handler functions for tRPC procedures
export async function handleToggleAutoAnalysis(input: { enabled: boolean }) {
	return handleAutoAnalysisToggleLogic(
		input.enabled,
		ALARM_NAME,
		chromeAlarmAPI,
	);
}

export async function handleStartManualAnalysis(input: {
	historyItems: chrome.history.HistoryItem[];
	customPrompts?: {
		systemPrompt?: string;
		chunkPrompt?: string;
		mergePrompt?: string;
	};
	memorySettings?: { storeWorkflowPatterns: boolean };
}): Promise<
	{ success: true; analysisId: string } | { success: false; error: string }
> {
	const { historyItems, customPrompts, memorySettings } = input;

	// Check if analysis is already running
	const { canStart, error } = checkAnalysisRunningLogic(isAnalysisRunning);
	if (!canStart) {
		return {
			success: false,
			error: error || "Cannot start analysis",
		};
	}

	isAnalysisRunning = true;
	const analysisId = `manual-${Date.now()}`;
	currentAnalysisId = analysisId;

	broadcastAnalysisStatus("started", {
		message: `Starting manual analysis of ${historyItems.length} items...`,
	});

	try {
		console.log(
			`[Background] Starting manual analysis with ${historyItems.length} items`,
		);
		await runAnalysis(
			historyItems,
			analysisId,
			customPrompts,
			"manual",
			memorySettings,
		);

		return {
			success: true,
			analysisId: analysisId,
		};
	} catch (error) {
		console.error("[Background] Manual analysis failed:", error);
		isAnalysisRunning = false;
		currentAnalysisId = null;

		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

export async function handleCancelAnalysis(input: {
	analysisId: string;
}): Promise<{ success: boolean; error?: string }> {
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
				await offscreenClient.offscreen.cancelAnalysis.mutate({
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
	await ensureOffscreenDocument();
	// Forward the message to the offscreen document
	await offscreenClient.offscreen.initializeAI.mutate();
}

export async function handleGetAIConfig(): Promise<AIProviderConfig> {
	// Directly load config here to avoid import issues
	try {
		const AI_CONFIG_KEY = "ai_provider_config";
		const result = await chrome.storage.local.get(AI_CONFIG_KEY);
		const stored = result[AI_CONFIG_KEY];

		if (stored?.provider && ["chrome", "claude"].includes(stored.provider)) {
			console.log("[Background] Loaded AI config for offscreen:", {
				provider: stored.provider,
			});
			return stored as AIProviderConfig;
		}

		console.log("[Background] No valid AI config found, using default");
		return { provider: "chrome" } as AIProviderConfig;
	} catch (error) {
		console.error("[Background] Failed to load AI config:", error);
		return { provider: "chrome" } as AIProviderConfig;
	}
}

export async function handleReadMemory() {
	const memory = await loadMemoryFromStorage();
	return { memory };
}

export async function handleWriteMemory(input: { memory: unknown }) {
	await saveMemoryToStorage(input.memory as AnalysisMemory);
	return { success: true };
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
	_trpc?: unknown,
): Promise<{ success: boolean }> {
	// Store progress for state queries
	if (input.analysisId) {
		updateProgressMap(input.analysisId, input, analysisProgressMap);
	}

	// Forward to side panel
	try {
		// Use the analysis.onProgress subscription to notify UI
		console.log("[Background] Progress update:", input);
	} catch (err) {
		// Side panel might be closed
		console.debug("[Background] Failed to forward progress:", err);
	}
	return { success: true };
}

export async function handleCompleteReport(input: {
	analysisId: string;
	result: unknown;
}): Promise<{ success: boolean }> {
	const { analysisId } = input;

	// Update state
	if (currentAnalysisId === analysisId) {
		isAnalysisRunning = false;
		currentAnalysisId = null;
	}
	activeAnalyses.delete(analysisId);

	console.log("[Background] Analysis completed:", analysisId);
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
	input: {
		status: "initializing" | "available" | "error";
		error?: string;
	},
	_trpc?: unknown,
): Promise<{ success: boolean }> {
	try {
		// Forward to sidepanel via subscription
		console.log("[Background] AI status update:", input.status, input.error);
	} catch (err) {
		// Sidepanel might be closed
		console.debug("[Background] Failed to forward AI status:", err);
	}
	return { success: true };
}

// Run analysis function
async function runAnalysis(
	historyItems: chrome.history.HistoryItem[],
	analysisId: string,
	customPrompts?: {
		systemPrompt?: string;
		chunkPrompt?: string;
		mergePrompt?: string;
	},
	trigger: "manual" | "alarm" = "manual",
	memorySettings?: { storeWorkflowPatterns: boolean },
): Promise<void> {
	console.log(
		`[Background] Starting analysis for ${historyItems.length} items with ID: ${analysisId} (triggered by: ${trigger})`,
	);

	activeAnalyses.set(analysisId, true);

	try {
		// Ensure offscreen document exists
		await ensureOffscreenDocument();

		// Send analysis request to offscreen document
		const result = await offscreenClient.offscreen.startAnalysis.mutate({
			historyItems,
			customPrompts,
			analysisId,
			trigger,
			memorySettings,
		});

		console.log("[Background] Analysis started successfully:", result);

		broadcastAnalysisStatus("completed", {
			message: `Analysis completed successfully for ${historyItems.length} items`,
			itemCount: historyItems.length,
		});

		// Update settings and send notification
		const settings = await loadAutoAnalysisSettings();
		await saveAutoAnalysisSettings({
			...settings,
			lastRunTimestamp: Date.now(),
			lastRunStatus: "success",
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
				broadcastAnalysisStatus("error", {
					error: "Analysis cancelled",
					message: "Analysis was cancelled by user",
				});
			})
			.otherwise(async () => {
				broadcastAnalysisStatus("error", {
					error: errorMessage,
					message: `Analysis failed: ${errorMessage}`,
				});

				// Update settings and send notification
				const settings = await loadAutoAnalysisSettings();
				await saveAutoAnalysisSettings({
					...settings,
					lastRunTimestamp: Date.now(),
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
			await chrome.alarms.clear(ALARM_NAME);
			await chrome.alarms.create(ALARM_NAME, {
				delayInMinutes: 60,
			});
			console.log("[Background] Next analysis scheduled in 1 hour");
		}
	}
}

// Export functions needed by background.ts
export async function triggerAnalysis(trigger: "manual" | "alarm") {
	console.log(`[Analysis] Triggered by: ${trigger}`);

	// Check if analysis is already running
	if (isAnalysisRunning) {
		console.log("[Analysis] Analysis already in progress, skipping.");
		if (trigger === "manual") {
			// For manual triggers, notify the user
			broadcastAnalysisStatus("skipped", {
				reason: "analysis-already-running",
				message: "Analysis is already in progress",
			});
		}
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

	isAnalysisRunning = true;
	broadcastAnalysisStatus("started", {
		message: "Checking for new browsing history...",
	});

	try {
		// Determine time range based on trigger
		let historyItems: chrome.history.HistoryItem[];

		if (trigger === "manual") {
			// For manual trigger, get last hour of history
			const searchStartTime = Date.now() - 60 * 60 * 1000; // 1 hour ago
			historyItems = await chromeAPI.searchHistory({
				text: "",
				startTime: searchStartTime,
				endTime: Date.now(),
				maxResults: 5000,
			});
		} else {
			// For alarm trigger, get history since last analysis
			const memoryResult = await chrome.storage.local.get(
				"history_analysis_memory",
			);
			const memory = memoryResult.history_analysis_memory;
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

			historyItems = await chromeAPI.searchHistory({
				text: "",
				startTime: searchStartTime,
				endTime: Date.now(),
				maxResults: 5000,
			});
		}

		console.log(
			`[Analysis] Found ${historyItems.length} history items to analyze`,
		);

		if (historyItems.length === 0) {
			console.log("[Analysis] No history to analyze");

			await saveAutoAnalysisSettings({
				...settings,
				lastRunTimestamp: Date.now(),
				lastRunStatus: "success",
			});

			isAnalysisRunning = false;
			broadcastAnalysisStatus("skipped", {
				reason: "no-new-history",
				message: "No browsing history to analyze",
			});
			return;
		}

		// Run analysis in service worker
		console.log("[Analysis] Running analysis in service worker");

		const promptsResult = await chrome.storage.local.get("custom_prompts");
		const customPrompts = promptsResult.custom_prompts;

		// Load memory settings for alarm trigger as well
		const MEMORY_SETTINGS_KEY = "memory_settings";
		const memoryResult = await chrome.storage.local.get(MEMORY_SETTINGS_KEY);
		const memorySettings = {
			storeWorkflowPatterns: true, // default
			...(memoryResult[MEMORY_SETTINGS_KEY] || {}),
		};

		const analysisId = `analysis-${Date.now()}`;
		currentAnalysisId = analysisId;
		await runAnalysis(
			historyItems,
			analysisId,
			customPrompts,
			trigger,
			memorySettings,
		);
	} catch (error) {
		// Error already handled and logged by runAnalysis
		console.error("[Analysis] Error in triggerAnalysis:", error);
		isAnalysisRunning = false;
	}
}

export async function handleStartupAlarmCheck() {
	await handleStartupAlarmCheckLogic(ALARM_NAME, chromeAlarmAPI);
}
