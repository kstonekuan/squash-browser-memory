/// <reference types="@types/dom-chromium-ai" />

import { createTRPCMessageHandler } from "./trpc/chrome-adapter";
import { offscreenToBackgroundClient } from "./trpc/client";
import { offscreenRouter } from "./trpc/offscreen-router";

// ============================================
// tRPC Handler Setup
// ============================================

// Create context for tRPC procedures
function createContext(sender?: chrome.runtime.MessageSender) {
	return {
		timestamp: Date.now(),
		sender,
	};
}

// Set up tRPC message handler for incoming requests from background
const messageHandler = createTRPCMessageHandler(
	offscreenRouter,
	createContext,
	(message) => {
		// Only accept messages targeted to offscreen
		const msg = message as { target?: string };
		return msg.target === "offscreen";
	},
);

// Handle tRPC messages via sendMessage
chrome.runtime.onMessage.addListener(messageHandler);

console.log("[Offscreen] Document initialized with tRPC message handler");

// Periodic alarm health check (every 5 minutes)
setInterval(
	async () => {
		try {
			const result =
				await offscreenToBackgroundClient.ambient.verifyAlarmHealth.query();
			if (result.recreated) {
				console.log("[Offscreen] Alarm was recreated during health check");
			}
		} catch (error) {
			// Background might be sleeping, that's ok
			console.debug(
				"[Offscreen] Alarm health check failed (background sleeping?):",
				error,
			);
		}
	},
	5 * 60 * 1000,
); // Every 5 minutes

console.log("[Offscreen] Started periodic alarm health checks");
