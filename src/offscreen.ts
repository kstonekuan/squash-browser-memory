/// <reference types="@types/dom-chromium-ai" />

import { createChromeHandler } from "./trpc/chrome-adapter";

// ============================================
// tRPC Handler Setup
// ============================================

// Create context for tRPC procedures
function createContext() {
	return {
		timestamp: Date.now(),
	};
}

// Import the offscreen router directly
import { offscreenRouter } from "./trpc/offscreen-router";

// Set up tRPC handler for incoming requests
createChromeHandler({
	router: offscreenRouter,
	createContext,
	onError: (error, operation) => {
		console.error("[Offscreen tRPC] Error:", error, "Operation:", operation);
	},
});

console.log("[Offscreen] Document initialized with tRPC handler");
