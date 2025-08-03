// This script is injected into the page context to provide the Squash API
(() => {
	// Track permission status
	window.__squashPermissionGranted = false;

	// Listen for permission updates
	window.addEventListener("message", (event) => {
		if (event.data.type === "SQUASH_UPDATE_PERMISSION") {
			window.__squashPermissionGranted = event.data.granted;
		}
	});

	// Message passing bridge between page and content script
	window.__squashExtension = {
		requestPermission: async (appInfo) => {
			return new Promise((resolve) => {
				const id = Math.random().toString(36).substring(2, 11);
				window.postMessage(
					{ type: "SQUASH_REQUEST_PERMISSION", id, appInfo },
					"*",
				);

				const handler = (event) => {
					if (
						event.data.type === "SQUASH_PERMISSION_RESPONSE" &&
						event.data.id === id
					) {
						window.removeEventListener("message", handler);
						resolve(event.data.result);
					}
				};
				window.addEventListener("message", handler);
			});
		},

		getContext: async (options) => {
			console.log("[Injected API] getContext called with options:", options);
			return new Promise((resolve) => {
				const id = Math.random().toString(36).substring(2, 11);
				console.log("[Injected API] Posting SQUASH_GET_CONTEXT message");
				window.postMessage({ type: "SQUASH_GET_CONTEXT", id, options }, "*");

				let resolved = false;
				const handler = (event) => {
					if (
						event.data.type === "SQUASH_CONTEXT_RESPONSE" &&
						event.data.id === id
					) {
						resolved = true;
						window.removeEventListener("message", handler);
						// Ensure we always have a valid response object
						const result = event.data.result || {
							success: false,
							error: "No response data",
						};
						resolve(result);
					}
				};
				window.addEventListener("message", handler);

				// Add timeout to prevent hanging forever
				setTimeout(() => {
					if (!resolved) {
						window.removeEventListener("message", handler);
						resolve({ success: false, error: "Request timed out" });
					}
				}, 10000); // 10 second timeout
			});
		},

		isPermissionGranted: () => {
			// This will be updated by the content script
			return window.__squashPermissionGranted || false;
		},

		version: "1.0.0",
	};
})();
