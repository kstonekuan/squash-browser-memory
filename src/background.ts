// Background service worker for the Squash extension
/// <reference types="@types/dom-chromium-ai" />

import {
	handleStartupAlarmCheck,
	triggerAnalysis,
} from "./background-handlers";
import { handleSDKMessage } from "./sdk-background-handlers";
import { backgroundRouter } from "./trpc/background-router";
import { createTRPCMessageHandler } from "./trpc/chrome-adapter";
import { loadAutoAnalysisSettings } from "./utils/ambient";
import { ensureOffscreenDocument } from "./utils/chrome-api";
import { clearCorruptedStorage } from "./utils/clear-corrupted-storage";

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
	console.log("Squash extension installed");

	// Clear any corrupted storage
	await clearCorruptedStorage();

	// Create offscreen document on install
	const offscreenResult = await ensureOffscreenDocument();
	if (offscreenResult.isErr()) {
		console.error(
			"Failed to create offscreen document:",
			offscreenResult.error,
		);
		throw offscreenResult.error;
	}
	console.log("Offscreen document created");

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
	// Clear any corrupted storage
	await clearCorruptedStorage();

	// Create offscreen document on startup
	await ensureOffscreenDocument();
	console.log("Offscreen document created on startup");

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

// Set up tRPC message handler for incoming requests from sidepanel and offscreen
const messageHandler = createTRPCMessageHandler(
	backgroundRouter,
	(sender) => ({
		timestamp: Date.now(),
		sender,
	}),
	(message) => {
		// Only accept messages targeted to background
		const msg = message as { target?: string };
		return !msg.target || msg.target === "background";
	},
);

// Combined message handler for tRPC and SDK messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	// First try SDK message handler
	if (
		message.type?.startsWith("SDK_") ||
		message.type === "PERMISSION_RESPONSE"
	) {
		return handleSDKMessage(message, sender, sendResponse);
	}

	// Otherwise use tRPC handler
	return messageHandler(message, sender, sendResponse);
});

console.log("[Background] Message handlers initialized (tRPC + SDK)");

// Initialize offscreen document immediately on service worker start
// This ensures it's available for all operations
ensureOffscreenDocument().match(
	() => console.log("[Background] Offscreen document ready"),
	(error) =>
		console.error("[Background] Failed to create offscreen document:", error),
);
