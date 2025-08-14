/**
 * Background handlers for SDK API requests
 */

import type {
	Context,
	ContextOptions,
	Pattern,
	Topic,
} from "./types/sdk-types";
import { createChromeStorage, getStorageData } from "./utils/storage";

// Track pending permission requests
const pendingPermissionRequests = new Map<string, (granted: boolean) => void>();

// Show permission dialog
async function showPermissionDialog(
	appInfo: { appName: string; appId: string },
	domain: string,
): Promise<boolean> {
	return new Promise((resolve) => {
		const requestId = Math.random().toString(36).substring(2, 11);
		pendingPermissionRequests.set(requestId, resolve);

		// First, try to use the popup approach
		chrome.storage.local.set(
			{
				pendingPermissionRequest: {
					requestId,
					appName: appInfo.appName,
					appId: appInfo.appId,
					domain,
					timestamp: Date.now(),
				},
			},
			() => {
				// Try to open the extension popup (requires Chrome 127+)
				if (chrome.action.openPopup) {
					chrome.action.openPopup().catch(() => {
						// If opening popup fails, fall back to new window approach
						openPermissionWindow();
					});
				} else {
					// If openPopup API not available, use new window approach
					openPermissionWindow();
				}

				function openPermissionWindow() {
					const width = 520;
					const height = 480;
					const url = chrome.runtime.getURL(
						`src/permission-dialog/permission-dialog.html?appName=${encodeURIComponent(appInfo.appName)}&domain=${encodeURIComponent(domain)}&requestId=${requestId}`,
					);

					// Get the current window to center the popup
					chrome.windows.getCurrent((currentWindow) => {
						const left = currentWindow.left
							? Math.round(
									currentWindow.left +
										(currentWindow.width || 800) / 2 -
										width / 2,
								)
							: 100;
						const top = currentWindow.top
							? Math.round(
									currentWindow.top +
										(currentWindow.height || 600) / 2 -
										height / 2,
								)
							: 100;

						chrome.windows.create({
							url,
							type: "popup",
							width,
							height,
							left,
							top,
						});
					});
				}
			},
		);

		// Set a timeout in case the window is closed without a response
		setTimeout(() => {
			if (pendingPermissionRequests.has(requestId)) {
				pendingPermissionRequests.delete(requestId);
				chrome.storage.local.remove(["pendingPermissionRequest"]);
				resolve(false);
			}
		}, 60000); // 1 minute timeout
	});
}

// Get context data for SDK
async function getContextForSDK(
	options: ContextOptions = {},
): Promise<Context | null> {
	try {
		console.log(
			"[SDK Background] getContextForSDK called with options:",
			options,
		);

		// Get memory from storage
		const storage = createChromeStorage();
		if (!storage) {
			console.error("Chrome storage not available");
			return null;
		}

		const memoryResult = await getStorageData(
			storage,
			"history_analysis_memory",
		);
		if (memoryResult.isErr()) {
			console.error("Failed to get memory:", memoryResult.error);
			return null;
		}

		const memory = memoryResult.value;
		console.log("[SDK Background] Memory retrieved:", !!memory);

		if (!memory) {
			console.log("[SDK Background] No memory found, returning null");
			return null;
		}

		// Filter based on options
		const context: Context = {
			summary:
				memory.userProfile?.summary || "No browsing patterns analyzed yet",
			patterns:
				memory.patterns?.map((p) => ({
					name: p.pattern,
					description: p.description,
					frequency: p.frequency,
					lastSeen: Date.now(), // Using current time as approximation
				})) || [],
			topics:
				memory.userProfile?.dynamicContext?.currentInterests?.map(
					(interest: string) => ({
						topic: interest,
						relevance: 0.8, // Simplified for now
						keywords: [],
					}),
				) || [],
			recentActivities: [], // Could be populated from recent history
		};

		// Apply relevance query filter if provided
		if (options.relevanceQuery) {
			const queryTerms = options.relevanceQuery
				.toLowerCase()
				.split(",")
				.map((t: string) => t.trim());

			// Filter patterns
			context.patterns = context.patterns.filter((pattern: Pattern) =>
				queryTerms.some(
					(term: string) =>
						pattern.name.toLowerCase().includes(term) ||
						pattern.description?.toLowerCase().includes(term),
				),
			);

			// Filter topics
			context.topics = context.topics.filter((topic: Topic) =>
				queryTerms.some((term: string) =>
					topic.topic.toLowerCase().includes(term),
				),
			);
		}

		// Apply token limit if specified
		if (options.maxTokens) {
			// Simplified token counting (roughly 4 chars per token)
			const contextString = JSON.stringify(context);
			const estimatedTokens = contextString.length / 4;

			if (estimatedTokens > options.maxTokens) {
				// Truncate patterns and topics proportionally
				const ratio = options.maxTokens / estimatedTokens;
				context.patterns = context.patterns.slice(
					0,
					Math.floor(context.patterns.length * ratio),
				);
				context.topics = context.topics.slice(
					0,
					Math.floor(context.topics.length * ratio),
				);
			}
		}

		return context;
	} catch (error) {
		console.error("Error getting context for SDK:", error);
		return null;
	}
}

// Handle SDK messages
interface SDKMessage {
	type: string;
	domain?: string;
	appInfo?: { appName: string; appId: string };
	options?: ContextOptions;
	requestId?: string;
	granted?: boolean;
	test?: boolean;
}

export function handleSDKMessage(
	message: SDKMessage,
	_sender: chrome.runtime.MessageSender,
	sendResponse: (response: Record<string, unknown>) => void,
): boolean {
	console.log("[SDK Background] Received message:", message.type);

	switch (message.type) {
		case "SDK_REQUEST_PERMISSION":
			// Handle async operation
			(async () => {
				try {
					// Check if permission already exists
					const storage = createChromeStorage();
					if (!storage || !message.domain) {
						sendResponse({ granted: false });
						return;
					}

					// Use a simple key-value approach for permissions
					const permissionKey = `permission_${message.domain}`;
					const existingResult = await new Promise<{ [key: string]: boolean }>(
						(resolve) => {
							storage.get(permissionKey, (result) => resolve(result));
						},
					);

					if (existingResult[permissionKey] !== undefined) {
						sendResponse({ granted: existingResult[permissionKey] === true });
						return;
					}

					// Show permission dialog
					if (!message.appInfo) {
						sendResponse({ granted: false });
						return;
					}

					const granted = await showPermissionDialog(
						message.appInfo,
						message.domain,
					);

					// Store permission with timestamp
					const updates: { [key: string]: boolean | number } = {
						[permissionKey]: granted,
					};

					if (granted) {
						updates[`permission_time_${message.domain}`] = Date.now();
					}

					await new Promise<void>((resolve) => {
						storage.set(updates, resolve);
					});

					sendResponse({ granted });
				} catch (error) {
					console.error("Error handling permission request:", error);
					sendResponse({ granted: false });
				}
			})();
			return true;

		case "SDK_GET_CONTEXT":
			// Test with immediate response first
			if (message.test) {
				console.log("[SDK Background] Test mode - sending immediate response");
				sendResponse({ success: true, test: true, message: "Test response" });
				return true;
			}

			// Handle async operation
			(async () => {
				try {
					console.log("[SDK Background] Processing SDK_GET_CONTEXT");

					// Verify permission first
					const storage = createChromeStorage();
					if (!storage || !message.domain) {
						sendResponse({ success: false, error: "Storage not available" });
						return;
					}

					const permissionKey = `permission_${message.domain}`;
					const permissionResult = await new Promise<{
						[key: string]: boolean;
					}>((resolve) => {
						storage.get(permissionKey, (result) => resolve(result));
					});
					const hasPermission = permissionResult[permissionKey] === true;

					console.log("[SDK Background] Permission check:", hasPermission);

					if (!hasPermission) {
						sendResponse({ success: false, error: "Permission not granted" });
						return;
					}

					// Get context data
					console.log("[SDK Background] Getting context data");
					const context = await getContextForSDK(message.options);

					if (context) {
						console.log("[SDK Background] Sending context response with data");
						const responseData = { success: true, data: context };
						console.log(
							"[SDK Background] Response data prepared:",
							responseData,
						);
						try {
							sendResponse(responseData);
							console.log("[SDK Background] Response sent successfully");
						} catch (err) {
							console.error("[SDK Background] Error sending response:", err);
						}
					} else {
						console.log("[SDK Background] No context available");
						try {
							sendResponse({ success: false, error: "No context available" });
							console.log("[SDK Background] Error response sent");
						} catch (err) {
							console.error(
								"[SDK Background] Error sending error response:",
								err,
							);
						}
					}
				} catch (error) {
					console.error("[SDK Background] Error getting context:", error);
					try {
						sendResponse({ success: false, error: "Failed to get context" });
					} catch (err) {
						console.error(
							"[SDK Background] Error sending error response:",
							err,
						);
					}
				}
			})();
			return true; // Indicates we'll call sendResponse asynchronously

		case "PERMISSION_RESPONSE":
			// Handle response from permission dialog
			if (
				message.requestId &&
				pendingPermissionRequests.has(message.requestId)
			) {
				const resolver = pendingPermissionRequests.get(message.requestId);
				pendingPermissionRequests.delete(message.requestId);
				if (resolver && message.granted !== undefined) {
					resolver(message.granted);
				}
			}
			return true;
	}

	return false;
}
