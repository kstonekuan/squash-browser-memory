// Background service worker for the History Workflow Analyzer extension
/// <reference types="@types/dom-chromium-ai" />

import {
	handleStartupAlarmCheck,
	triggerAnalysis,
} from "./background-handlers";
import { appRouter } from "./trpc/router";
import { createChromeHandler } from "./utils/trpc-chrome";

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
			await triggerAnalysis("alarm");
		} catch (error) {
			console.error("Failed to run analysis from alarm:", error);
		}
	}
});

// Check alarm status on startup
chrome.runtime.onStartup.addListener(async () => {
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
	router: appRouter,
	createContext: () => ({
		timestamp: Date.now(),
	}),
	onError: (error, operation) => {
		console.error("[tRPC] Error:", error, "Operation:", operation);
	},
});

console.log("[Background] tRPC handler initialized");
