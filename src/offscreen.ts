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

// Import the offscreen-specific router
import { offscreenRouter } from "./trpc/offscreen-router";

// Set up tRPC handler for incoming requests from background only
createChromeHandler({
	router: offscreenRouter,
	createContext,
	onError: (error, operation) => {
		console.error("[Offscreen tRPC] Error:", error, "Operation:", operation);
	},
	// Only accept connections from the background script
	acceptPort: (port) => {
		return port.name === "background-to-offscreen";
	},
});

console.log("[Offscreen] Document initialized with tRPC handler");
