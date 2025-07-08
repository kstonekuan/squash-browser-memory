// Background service worker for the History Workflow Analyzer extension
/// <reference types="@types/dom-chromium-ai" />

import { format } from "date-fns";
import { match } from "ts-pattern";
import type { AIProviderConfig } from "./utils/ai-interface";
import {
	loadAutoAnalysisSettings,
	saveAutoAnalysisSettings,
} from "./utils/ambient";
import { loadMemoryFromStorage, saveMemoryToStorage } from "./utils/memory";
import {
	type AlarmAPI,
	cancelAnalysisLogic,
	checkAnalysisRunningLogic,
	getAnalysisStateLogic,
	handleAutoAnalysisToggleLogic,
	handleStartupAlarmCheckLogic,
	queryNextAlarmLogic,
	shouldCreateOffscreenDocument,
	updateProgressMap,
} from "./utils/message-handlers";
import type { AnalysisProgress } from "./utils/messaging";
import { onMessage, sendMessage } from "./utils/messaging";

// Track analysis state
let isAnalysisRunning = false;
let currentAnalysisId: string | null = null;

// Store analysis progress for when side panel reopens
// Using the AnalysisProgress type from messaging.ts

const analysisProgressMap = new Map<string, AnalysisProgress>();

// Offscreen document management
let creatingOffscreenDocument: Promise<void> | null = null;

async function ensureOffscreenDocument(): Promise<void> {
	// Check if we're already creating the document
	if (creatingOffscreenDocument) {
		await creatingOffscreenDocument;
		return;
	}

	// Check if document already exists
	const contexts = await chrome.runtime.getContexts({
		contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
	});

	if (!shouldCreateOffscreenDocument(contexts)) {
		console.log("[Background] Offscreen document already exists");
		return;
	}

	// Create the document
	console.log("[Background] Creating offscreen document");
	creatingOffscreenDocument = chrome.offscreen.createDocument({
		url: "offscreen.html",
		reasons: ["DOM_PARSER" as chrome.offscreen.Reason],
		justification:
			"AI analysis of browsing history requires DOM parsing capabilities",
	});

	try {
		await creatingOffscreenDocument;
		console.log("[Background] Offscreen document created successfully");
	} catch (error) {
		console.error("[Background] Failed to create offscreen document:", error);
		throw error;
	} finally {
		creatingOffscreenDocument = null;
	}
}

// Create notification
async function createNotification(
	title: string,
	message: string,
	type: "success" | "error",
): Promise<void> {
	try {
		const notificationId = `history-analyzer-${Date.now()}`;
		const iconUrl = chrome.runtime.getURL("icon-48.png");

		await chrome.notifications.create(notificationId, {
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
		console.error("Failed to create notification:", error);
	}
}

// Broadcast analysis status to all contexts
async function broadcastAnalysisStatus(
	status: "started" | "completed" | "error" | "skipped",
	details?: {
		message?: string;
		itemCount?: number;
		reason?: string;
		error?: string;
	},
): Promise<void> {
	try {
		// With @webext-core/messaging, we can send to all contexts at once
		await sendMessage("analysis:status", {
			status,
			...details,
		});
	} catch (err) {
		// This is expected if no listeners are active
		if (
			err instanceof Error &&
			err.message.includes("Could not establish connection")
		) {
			console.debug("No listeners for analysis status (side panel closed)");
		} else {
			console.debug("No listeners for analysis status:", err);
		}
	}
}

// Track active analyses
const activeAnalyses = new Map<string, boolean>();

// Common analysis runner - delegates to offscreen document
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

		// Send analysis request to offscreen document and wait for completion
		await new Promise<void>((resolve, reject) => {
			// Set up one-time listeners for completion/error
			const completeHandler = onMessage(
				"offscreen:analysis-complete",
				async (msg) => {
					if (msg.data.analysisId === analysisId) {
						completeHandler();
						errorHandler();
						resolve();
					}
				},
			);

			const errorHandler = onMessage(
				"offscreen:analysis-error",
				async (msg) => {
					if (msg.data.analysisId === analysisId) {
						completeHandler();
						errorHandler();
						reject(new Error(msg.data.error));
					}
				},
			);

			// Send the start message
			sendMessage("offscreen:start-analysis", {
				historyItems,
				customPrompts,
				analysisId,
				trigger,
				memorySettings,
			}).catch((error) => {
				completeHandler();
				errorHandler();
				reject(error);
			});
		});

		console.log(`[Background] Analysis completed`);

		// Send success notification
		await broadcastAnalysisStatus("completed", {
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
				await broadcastAnalysisStatus("error", {
					error: "Analysis cancelled",
					message: "Analysis was cancelled by user",
				});
			})
			.otherwise(async () => {
				await broadcastAnalysisStatus("error", {
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

// Main analysis function that can be triggered by button or alarm
async function triggerAnalysis(trigger: "manual" | "alarm"): Promise<void> {
	console.log(`[Analysis] Triggered by: ${trigger}`);

	// Check if analysis is already running
	if (isAnalysisRunning) {
		console.log("[Analysis] Analysis already in progress, skipping.");
		if (trigger === "manual") {
			// For manual triggers, notify the user
			await broadcastAnalysisStatus("skipped", {
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
	await broadcastAnalysisStatus("started", {
		message: "Checking for new browsing history...",
	});

	try {
		// Determine time range based on trigger
		let historyItems: chrome.history.HistoryItem[];

		if (trigger === "manual") {
			// For manual trigger, get last hour of history
			const searchStartTime = Date.now() - 60 * 60 * 1000; // 1 hour ago
			historyItems = await chrome.history.search({
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

			historyItems = await chrome.history.search({
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
			await broadcastAnalysisStatus("skipped", {
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
		const result = await chrome.storage.local.get(MEMORY_SETTINGS_KEY);
		const memorySettings = {
			storeWorkflowPatterns: true, // default
			...(result[MEMORY_SETTINGS_KEY] || {}),
		};
		console.log(
			"🔧 [Background] Loaded memory settings for alarm analysis:",
			memorySettings,
		);

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

const ALARM_NAME = "hourly-analysis";

// Handle extension icon click to open side panel
chrome.action.onClicked.addListener((tab) => {
	chrome.sidePanel.open({ windowId: tab.windowId });
});

// Set up side panel behavior
chrome.sidePanel
	.setPanelBehavior({ openPanelOnActionClick: true })
	.catch((error) => console.error("Failed to set panel behavior:", error));

// Listen for installation
chrome.runtime.onInstalled.addListener(async () => {
	console.log("History Workflow Analyzer extension installed");

	const settings = await loadAutoAnalysisSettings();

	if (settings.enabled) {
		try {
			await chrome.alarms.clear(ALARM_NAME);
			await chrome.alarms.create(ALARM_NAME, {
				delayInMinutes: 1, // First run after 1 minute
			});
			console.log("Hourly analysis alarm created");
		} catch (error) {
			console.error("Failed to create alarm:", error);
		}
	}
});

// Handle alarm events
chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name === ALARM_NAME) {
		console.log("[Analysis] Alarm triggered");
		try {
			await triggerAnalysis("alarm");
		} catch (error) {
			console.error("Failed to run analysis from alarm:", error);
		}
	}
});

// Chrome API adapters for dependency injection
const chromeAlarmAPI: AlarmAPI = {
	clear: (name: string) => chrome.alarms.clear(name),
	create: (name: string, alarmInfo: chrome.alarms.AlarmCreateInfo) =>
		chrome.alarms.create(name, alarmInfo),
	get: (name: string) => chrome.alarms.get(name),
};

// Check alarm status on startup
chrome.runtime.onStartup.addListener(async () => {
	await handleStartupAlarmCheckLogic(ALARM_NAME, chromeAlarmAPI);
});

// Set up message handlers
onMessage("settings:toggle-auto-analysis", async (message) => {
	const data = message.data;
	return handleAutoAnalysisToggleLogic(
		data.enabled,
		ALARM_NAME,
		chromeAlarmAPI,
	);
});

onMessage("analysis:start-manual", async (message) => {
	const { historyItems, customPrompts } = message.data;

	// Check if analysis is already running
	const { canStart, error } = checkAnalysisRunningLogic(isAnalysisRunning);
	if (!canStart) {
		return {
			success: false,
			error,
		};
	}

	isAnalysisRunning = true;
	const analysisId = `manual-${Date.now()}`;
	currentAnalysisId = analysisId;

	await broadcastAnalysisStatus("started", {
		message: `Starting manual analysis of ${historyItems.length} items...`,
	});

	try {
		// Load memory settings to pass to analysis
		const MEMORY_SETTINGS_KEY = "memory_settings";
		const result = await chrome.storage.local.get(MEMORY_SETTINGS_KEY);
		const memorySettings = {
			storeWorkflowPatterns: true, // default
			...(result[MEMORY_SETTINGS_KEY] || {}),
		};
		console.log(
			"🔧 [Background] Loaded memory settings for analysis:",
			memorySettings,
		);

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
});

onMessage("analysis:cancel", async (message) => {
	const data = message.data;

	const { shouldCancel, error } = cancelAnalysisLogic(
		currentAnalysisId,
		data.analysisId,
		activeAnalyses,
	);

	if (!shouldCancel) {
		return { success: false, error };
	}

	// Send cancel message to offscreen document
	if (activeAnalyses.has(data.analysisId)) {
		try {
			// Ensure offscreen document exists
			const contexts = await chrome.runtime.getContexts({
				contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
			});

			if (contexts.length > 0) {
				await sendMessage("offscreen:cancel", {
					analysisId: data.analysisId,
				});
			}

			activeAnalyses.delete(data.analysisId);
			return { success: true };
		} catch (error) {
			console.error("[Background] Failed to cancel analysis:", error);
			return { success: false, error: "Failed to send cancel message" };
		}
	} else {
		return { success: false, error: "Analysis not found" };
	}
});

onMessage("ambient:query-status", async () => {
	return { isRunning: isAnalysisRunning };
});

onMessage("ambient:query-next-alarm", async () => {
	return queryNextAlarmLogic(ALARM_NAME, chromeAlarmAPI);
});

onMessage("analysis:get-state", async () => {
	return getAnalysisStateLogic(
		isAnalysisRunning,
		currentAnalysisId,
		analysisProgressMap,
	);
});

// Handle offscreen document messages
onMessage("offscreen:progress", async (message) => {
	const progress = message.data;

	// Store progress for state queries
	if (progress.analysisId) {
		updateProgressMap(progress.analysisId, progress, analysisProgressMap);
	}

	// Forward to side panel
	try {
		await sendMessage("analysis:progress", progress);
		console.log("[Background] Forwarded progress to side panel");
	} catch (err) {
		// Side panel might be closed
		console.debug("[Background] Failed to forward progress:", err);
	}
});

onMessage("offscreen:read-memory", async () => {
	const memory = await loadMemoryFromStorage();
	return { memory };
});

onMessage("offscreen:write-memory", async (message) => {
	await saveMemoryToStorage(message.data.memory);
	return { success: true };
});

onMessage("memory:clear-patterns", async () => {
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
});

onMessage("offscreen:keepalive", async () => {
	// Just acknowledge keepalive
	return { success: true };
});

onMessage("offscreen:get-ai-config", async () => {
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
});

// Handle Chrome AI initialization requests from sidepanel
onMessage("ai:initialize", async () => {
	await ensureOffscreenDocument();
	// Forward the message to the offscreen document
	await sendMessage("offscreen:initialize-ai");
});

// Forward AI status updates from offscreen to sidepanel
onMessage("offscreen:ai-status", async (message) => {
	try {
		// Forward to sidepanel
		await sendMessage("offscreen:ai-status", message.data);
		console.log(
			"[Background] Forwarded AI status to sidepanel:",
			message.data.status,
		);
	} catch (err) {
		// Sidepanel might be closed
		console.debug("[Background] Failed to forward AI status:", err);
	}
});

// Handle errors
self.addEventListener("error", (event) => {
	console.error("Background script error:", event.error);
});
