/**
 * Unified tRPC client configuration
 * Exports pre-configured client instances for each communication path
 */

import { createTRPCClient, createTRPCProxyClient } from "@trpc/client";
import { chromePortLink } from "../utils/trpc-chrome";
import type { AppRouter, OffscreenRouter } from "./router";

// Client for UI -> Background communication (used in sidepanel/popup)
// Uses proxy client for cleaner syntax in UI components
export const trpc = createTRPCProxyClient<AppRouter>({
	links: [chromePortLink({ portName: "ui-to-background" })],
});

// Client for Background -> Offscreen communication
export const offscreenClient = createTRPCClient<OffscreenRouter>({
	links: [
		chromePortLink({
			portName: "background-to-offscreen",
		}),
	],
});

// Client for Offscreen -> Background communication (used in offscreen document)
// Uses regular client for offscreen document
export const offscreenTrpc = createTRPCClient<AppRouter>({
	links: [
		chromePortLink({
			portName: "offscreen-trpc",
		}),
	],
});

// Helper function to create a client with custom port name
export function createClient(portName: string) {
	return createTRPCClient<AppRouter>({
		links: [chromePortLink({ portName })],
	});
}

// Re-export types for convenience
export type { AppRouter } from "./router";
export type UIClient = typeof trpc;
export type BackgroundClient = typeof offscreenClient;
export type OffscreenClient = typeof offscreenTrpc;
