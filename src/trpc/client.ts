/**
 * Unified tRPC client configuration
 * All clients now use sendMessage for communication
 */

import { createTRPCClient } from "@trpc/client";
import type { BackgroundRouter } from "./background-router";
import { chromeLinkWithSuperjson } from "./chrome-adapter";
import type { OffscreenRouter } from "./offscreen-router";

// Client for Sidepanel -> Background communication (used in sidepanel)
// Uses tRPC v11 client for cleaner syntax in UI components
export const sidepanelToBackgroundClient = createTRPCClient<BackgroundRouter>({
	links: [chromeLinkWithSuperjson({ target: "background" })],
});

// Client for Background -> Offscreen communication
// Now uses sendMessage instead of ports
export const backgroundToOffscreenClient = createTRPCClient<OffscreenRouter>({
	links: [chromeLinkWithSuperjson({ target: "offscreen" })],
});

// Client for Offscreen -> Background communication (used in offscreen document)
// Uses regular client for offscreen document
export const offscreenToBackgroundClient = createTRPCClient<BackgroundRouter>({
	links: [chromeLinkWithSuperjson({ target: "background" })],
});
