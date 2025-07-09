/**
 * Unified tRPC client configuration
 * Exports pre-configured client instances for each communication path
 */

import { createTRPCClient, createTRPCProxyClient } from "@trpc/client";
import { chromePortLink } from "./chrome-adapter";
import type { offscreenRouter } from "./offscreen-router";
import type { AppRouter } from "./router";

// Client for UI -> Background communication (used in sidepanel/popup)
// Uses proxy client for cleaner syntax in UI components
export const trpc = createTRPCProxyClient<AppRouter>({
	links: [chromePortLink({ portName: "ui-to-background" })],
});

// Client for Background -> Offscreen communication
export const offscreenClient = createTRPCClient<typeof offscreenRouter>({
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
