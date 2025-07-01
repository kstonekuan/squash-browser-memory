// Background service worker for the History Workflow Analyzer extension

// Inline ambient analysis functions to avoid ES6 imports in service worker

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
		// Create a unique notification ID
		const notificationId = `history-analyzer-${Date.now()}`;

		// Use the 48x48 icon for notifications
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
		// Don't throw - notifications are not critical
	}
}

// Send message to all tabs/side panels about ambient analysis status
async function broadcastAmbientAnalysisStatus(
	status: "started" | "completed" | "error" | "skipped",
	details?: {
		error?: string;
		reason?: string;
		itemCount?: number;
		message?: string;
	},
): Promise<void> {
	try {
		// Send to all tabs
		const tabs = await chrome.tabs.query({});
		for (const tab of tabs) {
			if (tab.id) {
				chrome.tabs
					.sendMessage(tab.id, {
						type: "ambient-analysis-status",
						status,
						...details,
					})
					.catch(() => {
						// Ignore errors - tab might not have content script
					});
			}
		}

		// Send to runtime (side panel)
		chrome.runtime
			.sendMessage({
				type: "ambient-analysis-status",
				status,
				...details,
			})
			.catch(() => {
				// Ignore errors - side panel might not be open
			});
	} catch (err) {
		console.error("Failed to broadcast ambient analysis status:", err);
	}
}

// Main ambient analysis function (simplified for service worker)
async function runAmbientAnalysis(): Promise<void> {
	console.log("[Ambient Analysis] Starting hourly analysis...");

	const settings = await loadAutoAnalysisSettings();

	// Check if auto-analysis is enabled
	if (!settings.enabled) {
		console.log("[Ambient Analysis] Auto-analysis is disabled, skipping.");
		return;
	}

	// Notify that ambient analysis has started
	isAmbientAnalysisRunning = true;
	await broadcastAmbientAnalysisStatus("started", {
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
		// If never analyzed, get last hour of history
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

		// Skip if no new history
		if (historyItems.length === 0) {
			console.log("[Ambient Analysis] No new history to analyze");

			// Update last run timestamp
			await saveAutoAnalysisSettings({
				...settings,
				lastRunTimestamp: Date.now(),
				lastRunStatus: "success",
			});

			// Notify skipped
			isAmbientAnalysisRunning = false;
			await broadcastAmbientAnalysisStatus("skipped", {
				reason: "no-new-history",
				message: "No new browsing history since last analysis",
			});
			return;
		}

		// Send message to trigger actual analysis in the side panel
		console.log("[Ambient Analysis] Triggering analysis for new history items");

		// Send ambient-analysis-trigger message to side panel
		try {
			// Try to send to runtime (side panel)
			await chrome.runtime.sendMessage({
				type: "ambient-analysis-trigger",
				historyItems: historyItems,
				timestamp: Date.now(),
			});
			console.log("[Ambient Analysis] Analysis trigger sent to side panel");
		} catch (_err) {
			console.log(
				"[Ambient Analysis] Side panel not available, will retry next hour",
			);
			// If side panel is not open, we'll skip this analysis
			await saveAutoAnalysisSettings({
				...settings,
				lastRunTimestamp: Date.now(),
				lastRunStatus: "success",
				lastRunError: undefined,
			});

			isAmbientAnalysisRunning = false;
			await broadcastAmbientAnalysisStatus("skipped", {
				reason: "panel-closed",
				message: "Side panel not open, will retry next hour",
			});
			return;
		}

		// Don't update success yet - wait for the side panel to complete
		// The side panel will send back a message when done
	} catch (error) {
		console.error("[Ambient Analysis] Error:", error);

		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";

		// Update settings with error
		await saveAutoAnalysisSettings({
			...settings,
			lastRunTimestamp: Date.now(),
			lastRunStatus: "error",
			lastRunError: errorMessage,
		});

		// Send error notification if enabled
		if (settings.notifyOnError) {
			await createNotification(
				"History Analysis Failed",
				`Ambient analysis encountered an error: ${errorMessage}`,
				"error",
			);
		}

		// Notify error
		isAmbientAnalysisRunning = false;
		await broadcastAmbientAnalysisStatus("error", {
			error: errorMessage,
			message: `Analysis failed: ${errorMessage}`,
		});

		// Re-throw to let the caller handle it
		throw error;
	}
}

const ALARM_NAME = "hourly-analysis";

// Handle extension icon click to open side panel
chrome.action.onClicked.addListener((tab) => {
	// Open the side panel when the extension icon is clicked
	chrome.sidePanel.open({ windowId: tab.windowId });
});

// Set up side panel behavior
chrome.sidePanel
	.setPanelBehavior({ openPanelOnActionClick: true })
	.catch((error) => console.error("Failed to set panel behavior:", error));

// Listen for installation
chrome.runtime.onInstalled.addListener(async (_details) => {
	console.log("History Workflow Analyzer extension installed");

	// Load settings to check if auto-analysis should be enabled
	const settings = await loadAutoAnalysisSettings();

	if (settings.enabled) {
		// Set up the hourly alarm
		try {
			// Clear any existing alarm first
			await chrome.alarms.clear(ALARM_NAME);

			// Create a new alarm that fires every hour
			await chrome.alarms.create(ALARM_NAME, {
				delayInMinutes: 1, // First run after 1 minute
				periodInMinutes: 60, // Then every hour
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

// Track ambient analysis state
let isAmbientAnalysisRunning = false;

// Listen for messages from the popup/side panel to enable/disable ambient analysis
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
	if (request.type === "toggle-auto-analysis") {
		handleAutoAnalysisToggle(request.enabled)
			.then(async () => {
				// Get the next alarm time after toggling
				const alarm = await chrome.alarms.get(ALARM_NAME);
				sendResponse({
					success: true,
					nextRunTime: alarm ? alarm.scheduledTime : null,
				});
			})
			.catch((error) => sendResponse({ success: false, error: error.message }));
		return true; // Keep the message channel open for async response
	}

	// Debug: manually trigger analysis
	if (request.type === "debug-trigger-analysis") {
		runAmbientAnalysis()
			.then(() => sendResponse({ success: true }))
			.catch((error) => sendResponse({ success: false, error: error.message }));
		return true;
	}

	// Query ambient analysis status
	if (request.type === "query-ambient-analysis-status") {
		sendResponse({ isRunning: isAmbientAnalysisRunning });
		return false; // Synchronous response
	}

	// Query next alarm time
	if (request.type === "query-next-alarm-time") {
		chrome.alarms.get(ALARM_NAME).then((alarm) => {
			sendResponse({
				nextRunTime: alarm ? alarm.scheduledTime : null,
				alarmExists: !!alarm,
			});
		});
		return true; // Async response
	}

	// Handle ambient analysis completion from side panel
	if (request.type === "ambient-analysis-complete") {
		(async () => {
			const settings = await loadAutoAnalysisSettings();
			await saveAutoAnalysisSettings({
				...settings,
				lastRunTimestamp: Date.now(),
				lastRunStatus: request.success ? "success" : "error",
				lastRunError: request.error,
			});

			if (request.success && settings.notifyOnSuccess) {
				await createNotification(
					"History Analysis Complete",
					`Successfully analyzed ${request.itemCount || 0} new items`,
					"success",
				);
			}

			// Get the next alarm time after completion
			const alarm = await chrome.alarms.get(ALARM_NAME);
			if (alarm) {
				await saveAutoAnalysisSettings({
					...settings,
					lastRunTimestamp: Date.now(),
					lastRunStatus: request.success ? "success" : "error",
					lastRunError: request.error,
					nextAlarmTime: alarm.scheduledTime,
				});
			}

			isAmbientAnalysisRunning = false;
			await broadcastAmbientAnalysisStatus("completed", {
				itemCount: request.itemCount,
				message: `Analyzed ${request.itemCount || 0} new items`,
			});

			sendResponse({ success: true });
		})();
		return true;
	}
});

// Handle toggling auto-analysis
async function handleAutoAnalysisToggle(enabled: boolean) {
	if (enabled) {
		// Clear any existing alarm first
		await chrome.alarms.clear(ALARM_NAME);

		// Create the alarm if enabling
		await chrome.alarms.create(ALARM_NAME, {
			delayInMinutes: 1,
			periodInMinutes: 60,
		});

		// Verify the alarm was created
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
		// Clear the alarm if disabling
		const cleared = await chrome.alarms.clear(ALARM_NAME);
		console.log(`Auto-analysis disabled. Alarm cleared: ${cleared}`);
	}
}

// Handle any errors
self.addEventListener("error", (event) => {
	console.error("Background script error:", event.error);
});

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

		// Check if it should be enabled
		const settings = await loadAutoAnalysisSettings();
		if (settings.enabled) {
			// Re-create the alarm
			await chrome.alarms.create(ALARM_NAME, {
				delayInMinutes: 1,
				periodInMinutes: 60,
			});
			console.log("Re-created hourly analysis alarm");
		}
	}
});
