// Background service worker for the History Workflow Analyzer extension
/// <reference types="@types/dom-chromium-ai" />

import { backgroundRouter } from "./trpc/background-router";
import { createChromeHandler } from "./trpc/chrome-adapter";
import { ensureOffscreenDocument } from "./utils/chrome-api";

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

	// Create offscreen document on install
	await ensureOffscreenDocument();
	console.log("Offscreen document created");

	const { loadAutoAnalysisSettings } = await import("./utils/ambient");
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
			const { triggerAnalysis } = await import("./background-handlers");
			await triggerAnalysis("alarm");
		} catch (error) {
			console.error("Failed to run analysis from alarm:", error);
		}
	}
});

// Check alarm status on startup
chrome.runtime.onStartup.addListener(async () => {
	// Create offscreen document on startup
	await ensureOffscreenDocument();
	console.log("Offscreen document created on startup");

	const { handleStartupAlarmCheck } = await import("./background-handlers");
	await handleStartupAlarmCheck();
});

// All message handling now done through tRPC

// Handle errors
self.addEventListener("error", (event) => {
	console.error("Background script error:", event.error);
});

// ============================================
// tRPC Handler Setup
// ============================================

// Set up tRPC handler for all incoming requests
createChromeHandler({
	router: backgroundRouter,
	createContext: () => ({
		timestamp: Date.now(),
	}),
	onError: (error, operation) => {
		console.error("[background tRPC] Error:", error, "Operation:", operation);
	},
});

console.log("[Background] tRPC handler initialized");

// Initialize offscreen document immediately on service worker start
// This ensures it's available for all operations
ensureOffscreenDocument()
	.then(() => console.log("[Background] Offscreen document ready"))
	.catch((error) =>
		console.error("[Background] Failed to create offscreen document:", error),
	);
