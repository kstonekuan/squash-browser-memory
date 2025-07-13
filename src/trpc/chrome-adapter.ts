/**
 * Simplified tRPC adapter for Chrome Extensions
 * Uses only chrome.runtime.sendMessage for all communication
 * No port connections, much simpler!
 */

import type { TRPCLink } from "@trpc/client";
import { TRPCClientError } from "@trpc/client";
import type { AnyRouter } from "@trpc/server";
import { observable } from "@trpc/server/observable";

/**
 * Options for the Chrome sendMessage link
 */
interface ChromeLinkOptions {
	/**
	 * Tab ID to send messages to (for background -> content script communication)
	 */
	tabId?: number;
	/**
	 * Target context for the message (e.g., "background", "offscreen", "sidepanel")
	 */
	target?: string;
}

/**
 * Chrome sendMessage link with SuperJSON transformer support
 * Simple request/response pattern, no persistent connections
 * The actual SuperJSON transformation happens in the routers
 */
export function chromeLinkWithSuperjson<TRouter extends AnyRouter>(
	options?: ChromeLinkOptions,
): TRPCLink<TRouter> {
	return () => {
		return ({ op }) => {
			return observable((observer) => {
				// Handle the request asynchronously
				(async () => {
					try {
						// Construct the tRPC message
						const message = {
							type: "trpc",
							target: options?.target,
							path: op.path,
							input: op.input,
						};

						// Send message - either to a specific tab or to the runtime
						const response = options?.tabId
							? await chrome.tabs.sendMessage(options.tabId, message)
							: await chrome.runtime.sendMessage(message);

						// Validate response
						if (!response || typeof response !== "object") {
							throw new Error("Invalid response from message handler");
						}

						// Handle success/error
						if (response.success) {
							observer.next({
								result: {
									type: "data",
									data: response.result,
								},
							});
							observer.complete();
						} else {
							observer.error(
								new TRPCClientError(response.error || "Unknown error"),
							);
						}
					} catch (error) {
						// Handle Chrome runtime errors
						if (
							error instanceof Error &&
							error.message.includes("Could not establish connection")
						) {
							observer.error(
								new TRPCClientError(
									"Extension context invalidated. Please reload.",
								),
							);
						} else {
							observer.error(
								new TRPCClientError(
									error instanceof Error ? error.message : "Unknown error",
								),
							);
						}
					}
				})();

				// No cleanup needed for one-shot messages
				return () => {};
			});
		};
	};
}

// Re-export the message handler creation utility
export { createTRPCMessageHandler } from "../utils/trpc-chrome-transport";
