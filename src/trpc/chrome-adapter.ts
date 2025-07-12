/**
 * Simplified tRPC adapter for Chrome Extensions
 * Uses only persistent port connections for all communication
 * Optimized for Manifest V3
 */

import type { Operation, TRPCLink } from "@trpc/client";
import { TRPCClientError } from "@trpc/client";
import type { AnyRouter } from "@trpc/server";
import { observable } from "@trpc/server/observable";

// Message protocol types
const MESSAGE_TYPE = {
	REQUEST: "trpc:request",
	RESPONSE: "trpc:response",
	ERROR: "trpc:error",
	SUBSCRIPTION_DATA: "trpc:subscription:data",
	SUBSCRIPTION_STOP: "trpc:subscription:stop",
	SUBSCRIPTION_ERROR: "trpc:subscription:error",
	SUBSCRIPTION_COMPLETE: "trpc:subscription:complete",
} as const;

interface TRPCMessage {
	id: number;
	type: (typeof MESSAGE_TYPE)[keyof typeof MESSAGE_TYPE];
	data?: unknown;
	error?: { message: string; code?: string; data?: unknown };
}

// ============================================
// PORT MANAGEMENT
// ============================================

// Cache for reusing port connections
const portCache = new Map<string, chrome.runtime.Port>();

/**
 * Get or create a port connection
 * Reuses existing ports when possible, creates new ones when needed
 */
function getOrCreatePort(portName: string): chrome.runtime.Port {
	let port = portCache.get(portName);

	// Check if port is still connected
	if (port) {
		try {
			// Test if port is still alive by checking runtime.lastError
			port.postMessage({ ping: true });
			if (chrome.runtime.lastError) {
				// Port is disconnected, remove from cache
				portCache.delete(portName);
				port = undefined;
			}
		} catch (_error) {
			// Port is disconnected
			portCache.delete(portName);
			port = undefined;
		}
	}

	// Create new port if needed
	if (!port) {
		port = chrome.runtime.connect({ name: portName });
		portCache.set(portName, port);

		// Clean up cache when port disconnects
		port.onDisconnect.addListener(() => {
			portCache.delete(portName);
		});
	}

	return port;
}

// ============================================
// CLIENT LINK
// ============================================

/**
 * Chrome port link - uses connect for all communication
 * Handles queries, mutations, and subscriptions through persistent connections
 */
function chromePortLink<TRouter extends AnyRouter>(options?: {
	portName?: string;
}): TRPCLink<TRouter> {
	const portName = options?.portName || "trpc";

	return () => {
		return ({ op }) => {
			return observable((observer) => {
				let port: chrome.runtime.Port | null = null;
				let isComplete = false;

				try {
					port = getOrCreatePort(portName);

					// Handle messages
					port.onMessage.addListener((message: unknown) => {
						if (!isTRPCMessage(message) || message.id !== op.id || isComplete) {
							return;
						}

						switch (message.type) {
							case MESSAGE_TYPE.RESPONSE:
							case MESSAGE_TYPE.SUBSCRIPTION_DATA:
								observer.next({
									result: {
										type: "data",
										data: message.data,
									},
								});
								if (op.type !== "subscription") {
									observer.complete();
									isComplete = true;
								}
								break;

							case MESSAGE_TYPE.SUBSCRIPTION_COMPLETE:
								observer.complete();
								isComplete = true;
								break;

							case MESSAGE_TYPE.ERROR:
							case MESSAGE_TYPE.SUBSCRIPTION_ERROR:
								observer.error(
									createClientError(
										message.error || { message: "Unknown error" },
									),
								);
								isComplete = true;
								break;
						}
					});

					// Handle disconnect
					port.onDisconnect.addListener(() => {
						if (!isComplete) {
							observer.error(
								createClientError({
									message: "Port disconnected",
									code: "PORT_DISCONNECTED",
								}),
							);
						}
					});

					// Send request
					port.postMessage({
						id: op.id,
						type: MESSAGE_TYPE.REQUEST,
						data: op,
					} as TRPCMessage);
				} catch (error) {
					observer.error(
						createClientError({
							message:
								error instanceof Error ? error.message : "Failed to connect",
						}),
					);
				}

				// Cleanup
				return () => {
					isComplete = true;
					if (port && op.type === "subscription") {
						try {
							port.postMessage({
								id: op.id,
								type: MESSAGE_TYPE.SUBSCRIPTION_STOP,
							} as TRPCMessage);
						} catch (_error) {
							// Port might be disconnected, ignore
						}
					}
					// Don't disconnect the port - let it be reused
				};
			});
		};
	};
}

// No need for chromeLink alias anymore - just use chromePortLink directly

// ============================================
// SERVER HANDLER
// ============================================

interface HandlerOptions<TRouter extends AnyRouter> {
	router: TRouter;
	createContext?: () => unknown | Promise<unknown>;
	onError?: (error: Error, operation: Operation) => void;
	acceptPort?: (port: chrome.runtime.Port) => boolean;
}

/**
 * Chrome extension handler - handles only port communication
 */
export function createChromeHandler<TRouter extends AnyRouter>(
	options: HandlerOptions<TRouter>,
) {
	const { router, createContext, onError, acceptPort } = options;

	// Handle port connections only
	chrome.runtime.onConnect.addListener((port) => {
		// Filter connections if acceptPort is provided
		if (acceptPort && !acceptPort(port)) {
			return; // Ignore this connection
		}

		const subscriptions = new Map<string, () => void>();

		port.onMessage.addListener(async (message: unknown) => {
			// Ignore ping messages used for connection testing
			if (message && typeof message === "object" && "ping" in message) {
				return;
			}

			if (!isTRPCMessage(message)) return;

			if (message.type === MESSAGE_TYPE.REQUEST) {
				try {
					const operation = message.data as Operation;
					const ctx = createContext ? await createContext() : {};

					if (operation.type === "subscription") {
						// Handle subscription
						const unsubscribe = await handleSubscription(
							router,
							operation,
							ctx,
							{
								onData: (data) => {
									port.postMessage({
										id: message.id,
										type: MESSAGE_TYPE.SUBSCRIPTION_DATA,
										data,
									} as TRPCMessage);
								},
								onError: (error) => {
									port.postMessage({
										id: message.id,
										type: MESSAGE_TYPE.SUBSCRIPTION_ERROR,
										error: serializeError(error),
									} as TRPCMessage);
								},
								onComplete: () => {
									port.postMessage({
										id: message.id,
										type: MESSAGE_TYPE.SUBSCRIPTION_COMPLETE,
									} as TRPCMessage);
								},
							},
						);

						subscriptions.set(String(message.id), unsubscribe);
					} else {
						// Handle query/mutation
						const result = await callProcedure(router, operation, ctx);
						port.postMessage({
							id: message.id,
							type: MESSAGE_TYPE.RESPONSE,
							data: result,
						} as TRPCMessage);
					}
				} catch (error) {
					const operation = message.data as Operation;
					onError?.(error as Error, operation);

					port.postMessage({
						id: message.id,
						type: MESSAGE_TYPE.ERROR,
						error: serializeError(error),
					} as TRPCMessage);
				}
			} else if (message.type === MESSAGE_TYPE.SUBSCRIPTION_STOP) {
				// Stop subscription
				const unsubscribe = subscriptions.get(String(message.id));
				if (unsubscribe) {
					unsubscribe();
					subscriptions.delete(String(message.id));
				}
			}
		});

		// Cleanup on disconnect
		port.onDisconnect.addListener(() => {
			subscriptions.forEach((unsubscribe) => unsubscribe());
			subscriptions.clear();
		});
	});
}

// ============================================
// UTILITIES
// ============================================

function isTRPCMessage(message: unknown): message is TRPCMessage {
	return (
		typeof message === "object" &&
		message !== null &&
		"id" in message &&
		"type" in message &&
		Object.values(MESSAGE_TYPE).includes((message as TRPCMessage).type)
	);
}

async function callProcedure(
	router: AnyRouter,
	operation: Operation,
	ctx: unknown,
): Promise<unknown> {
	const caller = router.createCaller(ctx);
	const path = operation.path.split(".");

	let procedure: unknown = caller;
	for (const segment of path) {
		procedure = (procedure as Record<string, unknown>)[segment];
		if (!procedure) {
			throw new Error(`Procedure not found: ${operation.path}`);
		}
	}

	return (procedure as (input: unknown) => unknown)(operation.input);
}

async function handleSubscription(
	router: AnyRouter,
	operation: Operation,
	ctx: unknown,
	callbacks: {
		onData: (data: unknown) => void;
		onError: (error: unknown) => void;
		onComplete: () => void;
	},
): Promise<() => void> {
	const result = await callProcedure(router, operation, ctx);

	// Handle async generator
	if (result && typeof result === "object" && Symbol.asyncIterator in result) {
		let cancelled = false;

		(async () => {
			try {
				for await (const data of result as AsyncGenerator) {
					if (cancelled) break;
					callbacks.onData(data);
				}
				if (!cancelled) {
					callbacks.onComplete();
				}
			} catch (error) {
				if (!cancelled) {
					callbacks.onError(error);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}

	throw new Error("Subscription must return an async generator");
}

function createClientError(error: {
	message: string;
	code?: string;
	data?: unknown;
}) {
	const clientError = new TRPCClientError(error.message);
	if (error.code)
		(clientError as typeof clientError & { code: string }).code = error.code;
	if (error.data)
		(clientError as typeof clientError & { data: unknown }).data = error.data;
	return clientError;
}

function serializeError(error: unknown): {
	message: string;
	code?: string;
	data?: unknown;
} {
	if (error instanceof Error) {
		return {
			message: error.message,
			code: (error as Error & { code?: string }).code,
			data: (error as Error & { data?: unknown }).data,
		};
	}
	return { message: String(error) };
}

/**
 * Chrome port link with SuperJSON transformer
 * Automatically handles Date serialization/deserialization
 */
export function chromeLinkWithSuperjson<TRouter extends AnyRouter>(options?: {
	portName?: string;
}): TRPCLink<TRouter> {
	// Our chromePortLink doesn't directly support transformer option yet
	// This is just a placeholder to maintain API compatibility
	// The actual SuperJSON transformation happens in the routers
	return chromePortLink(options);
}
