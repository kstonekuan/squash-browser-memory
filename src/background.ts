// Background service worker for the History Workflow Analyzer extension
/// <reference types="@types/dom-chromium-ai" />

import { format } from "date-fns";
import { match } from "ts-pattern";
import { analyzeHistoryItems } from "./utils/analyzer";
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

// Track active analyses
const activeAnalyses = new Map<string, AbortController>();

// Common analysis runner for both manual and ambient
async function runAnalysis(
	historyItems: chrome.history.HistoryItem[],
	analysisId: string,
	customPrompts?: {
		systemPrompt?: string;
		chunkPrompt?: string;
		mergePrompt?: string;
	},
	type: "manual" | "ambient" = "manual",
): Promise<void> {
	const logPrefix = type === "manual" ? "[Manual Analysis]" : "[Ambient]";
	console.log(
		`${logPrefix} Starting analysis for ${historyItems.length} items with ID: ${analysisId}`,
	);

	const abortController = new AbortController();
	activeAnalyses.set(analysisId, abortController);

	try {
		// Run analysis directly in service worker
		const result = await analyzeHistoryItems(
			historyItems,
			customPrompts,
			// Progress callback
			async (info) => {
				console.log(`${logPrefix} Analysis progress: ${info.phase}`, info);

				// Send progress update
				try {
					await sendMessage("analysis:progress", {
						analysisId,
						phase: info.phase,
						subPhase: info.subPhase,
						chunkProgress:
							info.currentChunk !== undefined && info.totalChunks !== undefined
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
					});
				} catch (err) {
					console.error(`${logPrefix} Failed to send progress update:`, err);
				}
			},
			abortController.signal,
		);

		console.log(`${logPrefix} Analysis completed:`, result);

		// Send final progress update
		try {
			await sendMessage("analysis:progress", {
				analysisId,
				phase: "complete",
				subPhase: undefined,
				chunkProgress: undefined,
			});
		} catch (err) {
			console.error(`${logPrefix} Failed to send completion progress:`, err);
		}

		// Send success notification
		await broadcastAnalysisStatus("completed", {
			message: `Analysis completed successfully for ${historyItems.length} items`,
			itemCount: historyItems.length,
		});

		// Handle success notification
		const settings = await loadAutoAnalysisSettings();
		await match(type)
			.with("manual", async () => {
				if (settings.notifyOnSuccess) {
					await createNotification(
						"Manual Analysis Complete",
						`Successfully analyzed ${historyItems.length} items`,
						"success",
					);
				}
			})
			.with("ambient", async () => {
				await saveAutoAnalysisSettings({
					...settings,
					lastRunTimestamp: Date.now(),
					lastRunStatus: "success",
				});
				if (settings.notifyOnSuccess) {
					await createNotification(
						"History Analysis Complete",
						`Successfully analyzed ${historyItems.length} new items`,
						"success",
					);
				}
			})
			.exhaustive();
	} catch (error) {
		console.error(`${logPrefix} Error:`, error);

		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";

		// Handle different error types
		await match(error)
			.with({ name: "AbortError" }, async () => {
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

				// Handle error notification
				const settings = await loadAutoAnalysisSettings();
				await match(type)
					.with("manual", async () => {
						await createNotification(
							"Manual Analysis Failed",
							`Analysis encountered an error: ${errorMessage}`,
							"error",
						);
					})
					.with("ambient", async () => {
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
					})
					.exhaustive();
			});

		throw error;
	} finally {
		activeAnalyses.delete(analysisId);
		if (type === "manual" && currentManualAnalysisId === analysisId) {
			currentManualAnalysisId = null;
			isManualAnalysisRunning = false;
		} else if (type === "ambient") {
			isAmbientAnalysisRunning = false;
		}
	}
}

// Run manual analysis directly in service worker
async function runManualAnalysis(
	historyItems: chrome.history.HistoryItem[],
	analysisId: string,
	customPrompts?: {
		systemPrompt?: string;
		chunkPrompt?: string;
		mergePrompt?: string;
	},
): Promise<void> {
	await broadcastAnalysisStatus("started", {
		message: `Analyzing ${historyItems.length} history items...`,
	});

	return runAnalysis(historyItems, analysisId, customPrompts, "manual");
}

// Main ambient analysis function
async function runAmbientAnalysis(): Promise<void> {
	console.log("[Ambient Analysis] Starting hourly analysis...");

	// Check if manual analysis is already running
	if (isManualAnalysisRunning) {
		console.log(
			"[Ambient Analysis] Manual analysis is in progress, skipping ambient analysis.",
		);
		await broadcastAnalysisStatus("skipped", {
			reason: "manual-analysis-running",
			message: "Skipped: Manual analysis is currently running",
		});
		return;
	}

	const settings = await loadAutoAnalysisSettings();

	if (!settings.enabled) {
		console.log("[Ambient Analysis] Auto-analysis is disabled, skipping.");
		// Don't broadcast when disabled - this is expected behavior
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
				lastTimestamp > 0
					? format(new Date(lastTimestamp), "yyyy-MM-dd'T'HH:mm:ss'Z'")
					: "never"
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

		// Try to send to side panel first, then run in service worker

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
		} catch {
			// Side panel not available, run in service worker
			console.log(
				"[Ambient Analysis] Side panel not available, running in service worker",
			);

			const promptsResult = await chrome.storage.local.get("custom_prompts");
			const customPrompts = promptsResult.custom_prompts;

			const analysisId = `ambient-${Date.now()}`;
			await runAnalysis(historyItems, analysisId, customPrompts, "ambient");
		}
	} catch {
		// Error already handled and logged by runAnalysis
		// Just ensure the flag is reset (though it should already be reset in runAnalysis)
		if (isAmbientAnalysisRunning) {
			isAmbientAnalysisRunning = false;
		}
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
				`Auto-analysis enabled. Next run: ${format(new Date(alarm.scheduledTime), "PPpp")}`,
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
			format(new Date(alarm.scheduledTime), "PPpp"),
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

	// Cancel the analysis
	const abortController = activeAnalyses.get(data.analysisId);
	if (abortController) {
		console.log("[Background] Cancelling analysis:", data.analysisId);
		abortController.abort();
		activeAnalyses.delete(data.analysisId);
		return { success: true };
	} else {
		return { success: false, error: "Analysis not found" };
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
		} as AnalysisProgress);
	}

	// Forward to popup/side panel and all contexts
	try {
		await sendMessage("analysis:progress", data);
	} catch {
		// No listeners active
	}
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
