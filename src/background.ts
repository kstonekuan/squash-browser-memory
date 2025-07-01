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
	const iconPath =
		type === "success" ? "icons/icon-48.svg" : "icons/icon-48.svg";

	// Create a unique notification ID
	const notificationId = `history-analyzer-${Date.now()}`;

	await chrome.notifications.create(notificationId, {
		type: "basic",
		iconUrl: iconPath,
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

	const _startTime = Date.now();

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
			return;
		}

		// For the service worker, we'll just log that we found new items
		// The full analysis would need to be done in the side panel
		console.log(
			"[Ambient Analysis] New history items found, analysis would be triggered here",
		);

		// Update settings with success
		await saveAutoAnalysisSettings({
			...settings,
			lastRunTimestamp: Date.now(),
			lastRunStatus: "success",
			lastRunError: undefined,
		});

		// Send success notification if enabled
		if (settings.notifyOnSuccess) {
			const message = `Found ${historyItems.length} new history items to analyze.`;
			await createNotification("New History Detected", message, "success");
		}
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

// Listen for messages from the popup/side panel to enable/disable ambient analysis
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
	if (request.type === "toggle-auto-analysis") {
		handleAutoAnalysisToggle(request.enabled)
			.then(() => sendResponse({ success: true }))
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
});

// Handle toggling auto-analysis
async function handleAutoAnalysisToggle(enabled: boolean) {
	if (enabled) {
		// Create the alarm if enabling
		await chrome.alarms.create(ALARM_NAME, {
			delayInMinutes: 1,
			periodInMinutes: 60,
		});
		console.log("Auto-analysis enabled");
	} else {
		// Clear the alarm if disabling
		await chrome.alarms.clear(ALARM_NAME);
		console.log("Auto-analysis disabled");
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
