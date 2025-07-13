/// <reference types="@types/dom-chromium-ai" />

import { createTRPCMessageHandler } from "./trpc/chrome-adapter";
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
