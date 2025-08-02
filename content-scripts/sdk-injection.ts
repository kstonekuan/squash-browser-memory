/**
 * SDK API Injection Content Script
 * Injects the __squashExtension API into all web pages
 */

import type { Context, ContextOptions } from "../sdk/squash-sdk/src/types";

// Type definitions for the injected API
interface SquashExtensionAPI {
	requestPermission: (appInfo: {
		appName: string;
		appId: string;
	}) => Promise<{ granted: boolean; isFirstTime: boolean }>;
	getContext: (
		options?: ContextOptions,
	) => Promise<{ success: boolean; data?: Context; error?: string }>;
	isPermissionGranted: () => boolean;
	version: string;
}

// Check if we have permission for the current domain
async function checkDomainPermission(): Promise<boolean> {
	const domain = window.location.hostname;
	const result = await chrome.storage.local.get(`permission_${domain}`);
	return result[`permission_${domain}`] === true;
}

// Save permission decision for the current domain
async function saveDomainPermission(granted: boolean): Promise<void> {
	const domain = window.location.hostname;
	await chrome.storage.local.set({ [`permission_${domain}`]: granted });
}

// Create the API object that will be injected
function createSquashAPI(): SquashExtensionAPI {
	let permissionGranted: boolean | null = null;

	return {
		requestPermission: async (appInfo) => {
			try {
				// Check if permission already granted
				const existingPermission = await checkDomainPermission();
				if (existingPermission) {
					permissionGranted = true;
					return { granted: true, isFirstTime: false };
				}

				// Send message to background script to show permission UI
				const response = await chrome.runtime.sendMessage({
					type: "SDK_REQUEST_PERMISSION",
					appInfo,
					domain: window.location.hostname,
				});

				if (response.granted) {
					await saveDomainPermission(true);
					permissionGranted = true;
				} else {
					await saveDomainPermission(false);
					permissionGranted = false;
				}

				return { granted: response.granted, isFirstTime: true };
			} catch (error) {
				console.error("Error requesting permission:", error);
				return { granted: false, isFirstTime: false };
			}
		},

		getContext: async (options = {}) => {
			try {
				// Check permission first
				if (permissionGranted === null) {
					permissionGranted = await checkDomainPermission();
				}

				if (!permissionGranted) {
					return { success: false, error: "Permission not granted" };
				}

				// Request context from background script
				const response = await chrome.runtime.sendMessage({
					type: "SDK_GET_CONTEXT",
					options,
					domain: window.location.hostname,
				});

				if (response.success) {
					return { success: true, data: response.data };
				} else {
					return {
						success: false,
						error: response.error || "Failed to get context",
					};
				}
			} catch (error) {
				console.error("Error getting context:", error);
				return {
					success: false,
					error: "Failed to communicate with extension",
				};
			}
		},

		isPermissionGranted: () => {
			if (permissionGranted !== null) {
				return permissionGranted;
			}
			// Synchronously check cached value
			// Note: This is a simplified version, in production you'd want to handle async properly
			return false;
		},

		version: "1.0.0",
	};
}

// Inject the API into the page
function injectAPI() {
	// Create a script element to inject the API into the page context
	const script = document.createElement("script");
	script.textContent = `
    (function() {
      // Message passing bridge between page and content script
      window.__squashExtension = {
        requestPermission: async (appInfo) => {
          return new Promise((resolve) => {
            const id = Math.random().toString(36).substr(2, 9);
            window.postMessage({ type: 'SQUASH_REQUEST_PERMISSION', id, appInfo }, '*');
            
            const handler = (event) => {
              if (event.data.type === 'SQUASH_PERMISSION_RESPONSE' && event.data.id === id) {
                window.removeEventListener('message', handler);
                resolve(event.data.result);
              }
            };
            window.addEventListener('message', handler);
          });
        },
        
        getContext: async (options) => {
          return new Promise((resolve) => {
            const id = Math.random().toString(36).substr(2, 9);
            window.postMessage({ type: 'SQUASH_GET_CONTEXT', id, options }, '*');
            
            const handler = (event) => {
              if (event.data.type === 'SQUASH_CONTEXT_RESPONSE' && event.data.id === id) {
                window.removeEventListener('message', handler);
                resolve(event.data.result);
              }
            };
            window.addEventListener('message', handler);
          });
        },
        
        isPermissionGranted: () => {
          // This will be updated by the content script
          return window.__squashPermissionGranted || false;
        },
        
        version: '1.0.0'
      };
    })();
  `;

	// Inject at the very beginning of the document
	if (document.documentElement) {
		document.documentElement.appendChild(script);
		script.remove();
	}
}

// Set up message passing between page and content script
const api = createSquashAPI();

window.addEventListener("message", async (event) => {
	// Only accept messages from the same window
	if (event.source !== window) return;

	switch (event.data.type) {
		case "SQUASH_REQUEST_PERMISSION": {
			const permResult = await api.requestPermission(event.data.appInfo);
			window.postMessage(
				{
					type: "SQUASH_PERMISSION_RESPONSE",
					id: event.data.id,
					result: permResult,
				},
				"*",
			);

			// Update the permission status in page context
			const updateScript = document.createElement("script");
			updateScript.textContent = `window.__squashPermissionGranted = ${permResult.granted};`;
			document.documentElement.appendChild(updateScript);
			updateScript.remove();
			break;
		}

		case "SQUASH_GET_CONTEXT": {
			const contextResult = await api.getContext(event.data.options);
			window.postMessage(
				{
					type: "SQUASH_CONTEXT_RESPONSE",
					id: event.data.id,
					result: contextResult,
				},
				"*",
			);
			break;
		}
	}
});

// Inject API as soon as possible
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", injectAPI);
} else {
	injectAPI();
}

// Also try to inject immediately
injectAPI();
