/**
 * Chrome transport layer for tRPC in extensions
 * Converts Chrome runtime messages into tRPC procedure calls
 */

import type { AnyRouter } from "@trpc/server";

/**
 * Creates a Chrome runtime message handler that processes tRPC calls
 * @param router The tRPC router to handle requests
 * @param createContext Optional context factory function
 * @param acceptMessage Optional filter function to accept/reject messages
 * @returns Chrome runtime message handler function
 */
export function createTRPCMessageHandler<TRouter extends AnyRouter>(
	router: TRouter,
	createContext?: (
		sender?: chrome.runtime.MessageSender,
	) => unknown | Promise<unknown>,
	acceptMessage?: (
		message: unknown,
		sender: chrome.runtime.MessageSender,
	) => boolean,
) {
	return (
		message: unknown,
		sender: chrome.runtime.MessageSender,
		sendResponse: (response: unknown) => void,
	): boolean => {
		// Only handle tRPC messages
		if (
			!message ||
			typeof message !== "object" ||
			!("type" in message) ||
			message.type !== "trpc"
		) {
			return false;
		}

		// Apply custom message filter if provided
		if (acceptMessage && !acceptMessage(message, sender)) {
			return false;
		}

		const trpcMessage = message as {
			type: "trpc";
			target?: string;
			path: string | string[];
			input?: unknown;
		};

		// Process asynchronously
		(async () => {
			try {
				// Create context
				const ctx = createContext ? await createContext(sender) : {};

				// Create caller with context
				const caller = router.createCaller(ctx);

				// Resolve the procedure path dynamically
				// tRPC paths can use either dots or array format
				const pathParts = Array.isArray(trpcMessage.path)
					? trpcMessage.path
					: trpcMessage.path.split(".");
				let procedure: unknown = caller;

				for (const part of pathParts) {
					procedure = (procedure as Record<string, unknown>)[part];
					if (!procedure) {
						throw new Error(
							`Procedure not found on path "${pathParts.join(".")}"`,
						);
					}
				}

				// Call the procedure
				const result = await (procedure as (input: unknown) => unknown)(
					trpcMessage.input,
				);

				// Send success response
				sendResponse({ success: true, result });
			} catch (error) {
				// Send error response
				console.error(`[tRPC Handler] Error in ${trpcMessage.path}:`, error);
				sendResponse({
					success: false,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		})();

		// Return true to indicate we'll send a response asynchronously
		return true;
	};
}
