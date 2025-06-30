// Background service worker for the History Workflow Analyzer extension

import { loadAutoAnalysisSettings, runAmbientAnalysis } from "./utils/ambient";

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
