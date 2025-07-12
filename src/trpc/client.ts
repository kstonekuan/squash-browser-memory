/**
 * Unified tRPC client configuration
 * Exports pre-configured client instances for each communication path
 */

import { createTRPCClient, createTRPCProxyClient } from "@trpc/client";
import type { BackgroundRouter } from "./background-router";
import { chromeLinkWithSuperjson } from "./chrome-adapter";
import type { OffscreenRouter } from "./offscreen-router";

// Client for UI -> Background communication (used in sidepanel/popup)
// Uses proxy client for cleaner syntax in UI components
export const uiToBackgroundClient = createTRPCProxyClient<BackgroundRouter>({
	links: [chromeLinkWithSuperjson({ portName: "ui-to-background" })],
});

// Client for Background -> Offscreen communication
// Now uses the offscreen namespace from the unified router
export const backgroundToOffscreenClient =
	createTRPCProxyClient<OffscreenRouter>({
		links: [
			chromeLinkWithSuperjson({
				portName: "background-to-offscreen",
			}),
		],
	});

// Client for Offscreen -> Background communication (used in offscreen document)
// Uses regular client for offscreen document
export const offscreenToBackgroundClient = createTRPCClient<BackgroundRouter>({
	links: [
		chromeLinkWithSuperjson({
			portName: "offscreen-trpc",
		}),
	],
});
