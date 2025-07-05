// Background service worker for the History Workflow Analyzer extension

import type { AnalysisProgress } from "./utils/messaging";
import { onMessage, sendMessage } from "./utils/messaging";

// Settings key for auto-analysis configuration
const AUTO_ANALYSIS_SETTINGS_KEY = "auto_analysis_settings";

interface AutoAnalysisSettings {
	enabled: boolean;
	notifyOnSuccess: boolean;
	notifyOnError: boolean;
	lastRunTimestamp?: number;
	lastRunStatus?: "success" | "error";
	lastRunError?: string;
	nextAlarmTime?: number; // Actual scheduled Chrome alarm time
}

// Default settings
const defaultAutoAnalysisSettings: AutoAnalysisSettings = {
	enabled: false,
	notifyOnSuccess: true,
	notifyOnError: true,
};

// Track analysis states
let isAmbientAnalysisRunning = false;
let isManualAnalysisRunning = false;
let currentManualAnalysisId: string | null = null;

// Store analysis progress for when side panel reopens
// Using the AnalysisProgress type from messaging.ts

const analysisProgressMap = new Map<string, AnalysisProgress>();

// Load auto-analysis settings
async function loadAutoAnalysisSettings(): Promise<AutoAnalysisSettings> {
	const result = await chrome.storage.local.get(AUTO_ANALYSIS_SETTINGS_KEY);
	return {
		...defaultAutoAnalysisSettings,
		...(result[AUTO_ANALYSIS_SETTINGS_KEY] || {}),
	};
}

// Save auto-analysis settings
async function saveAutoAnalysisSettings(
	settings: AutoAnalysisSettings,
): Promise<void> {
	await chrome.storage.local.set({
		[AUTO_ANALYSIS_SETTINGS_KEY]: settings,
	});
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
		console.debug("No listeners for analysis status:", err);
	}
}

// Create or get offscreen document
async function setupOffscreenDocument(): Promise<void> {
	if (!chrome.offscreen) {
		console.error("[Ambient Analysis] Offscreen API not available");
		throw new Error("Offscreen API not available");
	}

	try {
		await chrome.offscreen.createDocument({
			url: "offscreen.html",
			reasons: ["LOCAL_STORAGE"] as chrome.offscreen.Reason[],
			justification: "Running background analysis of browsing history",
		});
	} catch (error) {
		if (error instanceof Error && error.message.includes("already exists")) {
			// Offscreen document already exists, that's fine
		} else {
			console.error(
				"[Ambient Analysis] Failed to create offscreen document:",
				error,
			);
			throw error;
		}
	}
}

// Run manual analysis using offscreen document
async function runManualAnalysis(
	historyItems: chrome.history.HistoryItem[],
	analysisId: string,
	customPrompts?: {
		systemPrompt?: string;
		chunkPrompt?: string;
		mergePrompt?: string;
	},
): Promise<void> {
	console.log(
		"[Manual Analysis] Starting analysis for",
		historyItems.length,
		"items with ID:",
		analysisId,
	);

	await broadcastAnalysisStatus("started", {
		message: `Analyzing ${historyItems.length} history items...`,
	});

	try {
		await setupOffscreenDocument();

		// Send analysis request to offscreen document
		await sendMessage("analysis:run-in-offscreen", {
			historyItems,
			customPrompts,
			analysisId,
		});

		// Wait for result
		// Note: The actual result will come via a separate message
	} catch (error) {
		console.error("[Manual Analysis] Error:", error);

		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";

		await broadcastAnalysisStatus("error", {
			error: errorMessage,
			message: `Analysis failed: ${errorMessage}`,
		});

		await createNotification(
			"Manual Analysis Failed",
			`Analysis encountered an error: ${errorMessage}`,
			"error",
		);

		throw error;
	} finally {
		if (currentManualAnalysisId === analysisId) {
			currentManualAnalysisId = null;
		}
	}
}

// Main ambient analysis function
async function runAmbientAnalysis(): Promise<void> {
	console.log("[Ambient Analysis] Starting hourly analysis...");

	// Check if manual analysis is already running
	if (isManualAnalysisRunning) {
		console.log(
			"[Ambient Analysis] Manual analysis is in progress, skipping ambient analysis.",
		);
		return;
	}

	const settings = await loadAutoAnalysisSettings();

	if (!settings.enabled) {
		console.log("[Ambient Analysis] Auto-analysis is disabled, skipping.");
		return;
	}

	isAmbientAnalysisRunning = true;
	await broadcastAnalysisStatus("started", {
		message: "Checking for new browsing history...",
	});

	try {
		// Load memory to get the last analyzed timestamp
		const memoryResult = await chrome.storage.local.get(
			"history_analysis_memory",
		);
		const memory = memoryResult.history_analysis_memory;
		const lastTimestamp = memory?.lastHistoryTimestamp || 0;

		console.log(
			`[Ambient Analysis] Last analyzed timestamp: ${
				lastTimestamp > 0 ? new Date(lastTimestamp).toISOString() : "never"
			}`,
		);

		// Fetch history since last analysis
		const searchStartTime =
			lastTimestamp > 0 ? lastTimestamp + 1 : Date.now() - 60 * 60 * 1000;

		const historyItems = await chrome.history.search({
			text: "",
			startTime: searchStartTime,
			endTime: Date.now(),
			maxResults: 5000,
		});

		console.log(
			`[Ambient Analysis] Found ${historyItems.length} new history items since last analysis`,
		);

		if (historyItems.length === 0) {
			console.log("[Ambient Analysis] No new history to analyze");

			await saveAutoAnalysisSettings({
				...settings,
				lastRunTimestamp: Date.now(),
				lastRunStatus: "success",
			});

			isAmbientAnalysisRunning = false;
			await broadcastAnalysisStatus("skipped", {
				reason: "no-new-history",
				message: "No new browsing history since last analysis",
			});
			return;
		}

		// Try to send to side panel first, then fall back to offscreen
		let analysisHandled = false;

		// Check if side panel is open by trying to send a message
		try {
			await sendMessage("analysis:status", {
				status: "started",
				message: "Side panel analysis starting...",
			});

			// Side panel is available, send the ambient analysis trigger
			console.log(
				"[Ambient Analysis] Side panel available, delegating analysis",
			);

			// Send the history items to the side panel for analysis
			// Note: Using chrome.runtime for ambient trigger as it's not in our protocol map
			await chrome.runtime.sendMessage({
				type: "ambient-analysis-trigger",
				historyItems: historyItems,
			});

			analysisHandled = true;
		} catch {
			// Side panel not available, use offscreen document
			console.log(
				"[Ambient Analysis] Side panel not available, using offscreen document",
			);

			await setupOffscreenDocument();

			const promptsResult = await chrome.storage.local.get("custom_prompts");
			const customPrompts = promptsResult.custom_prompts;

			// Send to offscreen document
			await sendMessage("analysis:run-in-offscreen", {
				historyItems,
				customPrompts,
				analysisId: `ambient-${Date.now()}`,
			});

			analysisHandled = true;
		}

		if (!analysisHandled) {
			throw new Error("Unable to process analysis");
		}
	} catch (error) {
		console.error("[Ambient Analysis] Error:", error);

		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";

		await saveAutoAnalysisSettings({
			...settings,
			lastRunTimestamp: Date.now(),
			lastRunStatus: "error",
			lastRunError: errorMessage,
		});

		if (settings.notifyOnError) {
			await createNotification(
				"History Analysis Failed",
				`Ambient analysis encountered an error: ${errorMessage}`,
				"error",
			);
		}

		isAmbientAnalysisRunning = false;
		await broadcastAnalysisStatus("error", {
			error: errorMessage,
			message: `Analysis failed: ${errorMessage}`,
		});

		throw error;
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
				delayInMinutes: 1,
				periodInMinutes: 60,
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
		console.log("Hourly analysis alarm triggered");
		try {
			await runAmbientAnalysis();
		} catch (error) {
			console.error("Failed to run ambient analysis:", error);
		}
	}
});

// Handle toggling auto-analysis
async function handleAutoAnalysisToggle(enabled: boolean) {
	if (enabled) {
		await chrome.alarms.clear(ALARM_NAME);
		await chrome.alarms.create(ALARM_NAME, {
			delayInMinutes: 1,
			periodInMinutes: 60,
		});

		const alarm = await chrome.alarms.get(ALARM_NAME);
		if (alarm) {
			console.log(
				`Auto-analysis enabled. Next run: ${new Date(alarm.scheduledTime).toLocaleString()}`,
			);
		} else {
			console.error("Failed to create ambient analysis alarm");
			throw new Error("Failed to create alarm");
		}
	} else {
		const cleared = await chrome.alarms.clear(ALARM_NAME);
		console.log(`Auto-analysis disabled. Alarm cleared: ${cleared}`);
	}
}

// Check alarm status on startup
chrome.runtime.onStartup.addListener(async () => {
	const alarm = await chrome.alarms.get(ALARM_NAME);
	if (alarm) {
		console.log(
			"Hourly analysis alarm is active, next run:",
			new Date(alarm.scheduledTime).toLocaleString(),
		);
	} else {
		console.log("Hourly analysis alarm is not active");

		const settings = await loadAutoAnalysisSettings();
		if (settings.enabled) {
			await chrome.alarms.create(ALARM_NAME, {
				delayInMinutes: 1,
				periodInMinutes: 60,
			});
			console.log("Re-created hourly analysis alarm");
		}
	}
});

// Set up message handlers
onMessage("settings:toggle-auto-analysis", async (message) => {
	const data = message.data;
	try {
		await handleAutoAnalysisToggle(data.enabled);
		const alarm = await chrome.alarms.get(ALARM_NAME);
		return {
			success: true,
			nextRunTime: alarm ? alarm.scheduledTime : undefined,
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
});

onMessage("analysis:start-manual", async (message) => {
	const data = message.data;

	if (isManualAnalysisRunning) {
		console.log("[Background] Analysis already in progress");
		return { success: false, error: "Analysis already in progress" };
	}

	if (isAmbientAnalysisRunning) {
		console.log("[Background] Ambient analysis is running, blocking manual");
		return {
			success: false,
			error:
				"Ambient analysis is currently running. Please wait for it to complete.",
		};
	}

	const analysisId = `manual-${Date.now()}`;
	currentManualAnalysisId = analysisId;
	isManualAnalysisRunning = true;

	try {
		await runManualAnalysis(data.historyItems, analysisId, data.customPrompts);
		return { success: true, analysisId };
	} catch (error) {
		console.error("[Background] Manual analysis failed:", error);
		isManualAnalysisRunning = false;
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
});

onMessage("analysis:cancel", async (message) => {
	const data = message.data;
	console.log("[Manual Analysis] Received cancellation request");

	if (!currentManualAnalysisId || currentManualAnalysisId !== data.analysisId) {
		return { success: false, error: "No matching analysis in progress" };
	}

	try {
		// Forward cancellation to offscreen document
		await sendMessage("analysis:cancel", { analysisId: data.analysisId });
		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to cancel",
		};
	}
});

onMessage("ambient:query-status", async () => {
	return { isRunning: isAmbientAnalysisRunning };
});

onMessage("ambient:query-next-alarm", async () => {
	const alarm = await chrome.alarms.get(ALARM_NAME);
	return {
		nextRunTime: alarm ? alarm.scheduledTime : undefined,
		alarmExists: !!alarm,
	};
});

onMessage("analysis:get-state", async () => {
	// Return the current analysis state
	const currentProgress = currentManualAnalysisId
		? analysisProgressMap.get(currentManualAnalysisId)
		: undefined;

	return {
		isRunning: isManualAnalysisRunning || isAmbientAnalysisRunning,
		isManualAnalysisRunning,
		isAmbientAnalysisRunning,
		analysisId: currentManualAnalysisId || undefined,
		phase: currentProgress?.phase,
		chunkProgress: currentProgress?.chunkProgress,
		retryMessage: currentProgress?.retryMessage,
	};
});

// Handle progress updates from offscreen document
onMessage("analysis:progress", async (message) => {
	const data = message.data;

	// Store progress for state queries
	if (data.analysisId) {
		analysisProgressMap.set(data.analysisId, {
			analysisId: data.analysisId,
			phase: data.phase,
			subPhase: data.subPhase,
			chunkProgress: data.chunkProgress,
			retryMessage: data.retryMessage,
		} as AnalysisProgress);
	}

	// Forward to popup/side panel and all contexts
	try {
		await sendMessage("analysis:progress", data);
	} catch {
		// No listeners active
	}
});

// Handle results from offscreen document
onMessage("analysis:offscreen-result", async (message) => {
	const data = message.data;

	const isManual = data.analysisId.startsWith("manual-");

	if (data.cancelled) {
		await broadcastAnalysisStatus("error", {
			message: "Analysis cancelled by user",
		});
		isManualAnalysisRunning = false;
		return;
	}

	if (data.success) {
		const settings = await loadAutoAnalysisSettings();

		// Update settings for ambient analysis
		if (!isManual) {
			await saveAutoAnalysisSettings({
				...settings,
				lastRunTimestamp: Date.now(),
				lastRunStatus: "success",
				lastRunError: undefined,
			});
		}

		await broadcastAnalysisStatus("completed", {
			itemCount: data.itemCount,
			message: `Successfully analyzed ${data.itemCount || 0} items`,
		});

		if (
			(isManual && settings.notifyOnSuccess) ||
			(!isManual && settings.notifyOnSuccess)
		) {
			await createNotification(
				isManual ? "Manual Analysis Complete" : "History Analysis Complete",
				`Successfully analyzed ${data.itemCount || 0} new items`,
				"success",
			);
		}
	} else {
		await broadcastAnalysisStatus("error", {
			error: data.error,
			message: `Analysis failed: ${data.error}`,
		});
	}

	// Clean up
	if (isManual) {
		isManualAnalysisRunning = false;
		if (currentManualAnalysisId === data.analysisId) {
			currentManualAnalysisId = null;
		}
	} else {
		isAmbientAnalysisRunning = false;
	}

	// Clean up progress map
	analysisProgressMap.delete(data.analysisId);
});

// Handle ambient analysis completion from side panel
onMessage("ambient:analysis-complete", async (message) => {
	const data = message.data;
	const settings = await loadAutoAnalysisSettings();
	await saveAutoAnalysisSettings({
		...settings,
		lastRunTimestamp: Date.now(),
		lastRunStatus: data.success ? "success" : "error",
		lastRunError: data.error,
	});

	if (data.success && settings.notifyOnSuccess) {
		await createNotification(
			"History Analysis Complete",
			`Successfully analyzed ${data.itemCount || 0} new items`,
			"success",
		);
	}

	const alarm = await chrome.alarms.get(ALARM_NAME);
	if (alarm) {
		await saveAutoAnalysisSettings({
			...settings,
			lastRunTimestamp: Date.now(),
			lastRunStatus: data.success ? "success" : "error",
			lastRunError: data.error,
			nextAlarmTime: alarm.scheduledTime,
		});
	}

	isAmbientAnalysisRunning = false;
	await broadcastAnalysisStatus("completed", {
		itemCount: data.itemCount,
		message: `Analyzed ${data.itemCount || 0} new items`,
	});
});

// Handle errors
self.addEventListener("error", (event) => {
	console.error("Background script error:", event.error);
});
