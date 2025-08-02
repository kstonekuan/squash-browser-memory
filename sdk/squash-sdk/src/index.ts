/**
 * Squash SDK - Main Entry Point
 */

import { generateMockResult } from "./mock-data";
import type {
	Context,
	ContextOptions,
	ContextResult,
	InitResult,
	SquashConfig,
} from "./types";
import { UIManager } from "./ui";

const EXTENSION_STORE_URL =
	"https://chromewebstore.google.com/detail/squash-browser-memory-for/cbemgpconhoibnbbgjbeengcojcoeimh";

class SquashSDK {
	private config: SquashConfig | null = null;
	private initialized = false;
	private permissionGranted = false;
	private extensionVersion: string | null = null;
	private mockMode = false;
	private uiManager = new UIManager();
	private initPromise: Promise<InitResult> | null = null;

	/**
	 * Initialize the SDK with your app configuration
	 */
	async init(config: SquashConfig): Promise<InitResult> {
		// Return existing promise if already initializing
		if (this.initPromise) {
			return this.initPromise;
		}

		this.initPromise = this._doInit(config);
		return this.initPromise;
	}

	private async _doInit(config: SquashConfig): Promise<InitResult> {
		this.config = config;
		this.mockMode = config.mockMode || false;

		// Check if already initialized
		if (this.initialized) {
			return {
				initialized: true,
				extensionInstalled: this.isExtensionAvailable(),
				permissionGranted: this.permissionGranted,
				version: this.extensionVersion || undefined,
				isFirstTime: false,
			};
		}

		// In mock mode, simulate successful init
		if (this.mockMode) {
			this.initialized = true;
			this.permissionGranted = true;
			return {
				initialized: true,
				extensionInstalled: true,
				permissionGranted: true,
				version: "1.0.0-mock",
				isFirstTime: false,
			};
		}

		// Check if extension is installed
		const extensionAvailable = this.isExtensionAvailable();
		if (!extensionAvailable) {
			this.initialized = true;

			// Show install prompt if configured
			if (config.installPrompt && !this.uiManager.isPromptDismissed()) {
				setTimeout(() => {
					this.uiManager.showInstallPrompt({ theme: config.theme });
				}, 1000);
			}

			return {
				initialized: true,
				extensionInstalled: false,
				permissionGranted: false,
				isFirstTime: false,
			};
		}

		// Get extension version
		this.extensionVersion = window.__squashExtension!.version;

		// Check if we already have permission
		const hasPermission = window.__squashExtension!.isPermissionGranted();
		if (hasPermission) {
			this.initialized = true;
			this.permissionGranted = true;
			return {
				initialized: true,
				extensionInstalled: true,
				permissionGranted: true,
				version: this.extensionVersion,
				isFirstTime: false,
			};
		}

		// Request permission
		try {
			const { granted, isFirstTime } =
				await window.__squashExtension!.requestPermission({
					appName: config.appName,
					appId: config.appId,
				});

			this.initialized = true;
			this.permissionGranted = granted;

			return {
				initialized: true,
				extensionInstalled: true,
				permissionGranted: granted,
				version: this.extensionVersion,
				isFirstTime,
			};
		} catch (error) {
			console.error("Failed to request permission:", error);
			this.initialized = true;
			this.permissionGranted = false;

			return {
				initialized: true,
				extensionInstalled: true,
				permissionGranted: false,
				version: this.extensionVersion,
				isFirstTime: false,
			};
		}
	}

	/**
	 * Get browsing context from Squash
	 */
	async getContext(options?: ContextOptions): Promise<ContextResult> {
		// Check if initialized
		if (!this.initialized) {
			return {
				status: "not_initialized",
				metadata: {
					generatedAt: Date.now(),
					version: "1.0.0",
					tokenCount: 0,
				},
				error: "SDK not initialized. Call squash.init() first.",
			};
		}

		// Return mock data if in mock mode
		if (this.mockMode) {
			return generateMockResult(options);
		}

		// Check if extension is installed
		if (!this.isExtensionAvailable()) {
			return {
				status: "not_installed",
				metadata: {
					generatedAt: Date.now(),
					version: "1.0.0",
					tokenCount: 0,
				},
				installUrl: EXTENSION_STORE_URL,
			};
		}

		// Check permission
		if (!this.permissionGranted) {
			return {
				status: "permission_denied",
				metadata: {
					generatedAt: Date.now(),
					version: this.extensionVersion || "1.0.0",
					tokenCount: 0,
				},
			};
		}

		// Get context from extension
		try {
			const result = await window.__squashExtension!.getContext(options);

			if (result.success && result.data) {
				return {
					status: "success",
					context: result.data,
					metadata: {
						generatedAt: Date.now(),
						version: this.extensionVersion || "1.0.0",
						tokenCount: this.estimateTokenCount(result.data),
					},
				};
			} else {
				return {
					status: "error",
					metadata: {
						generatedAt: Date.now(),
						version: this.extensionVersion || "1.0.0",
						tokenCount: 0,
					},
					error: result.error || "Failed to get context",
				};
			}
		} catch (error) {
			return {
				status: "error",
				metadata: {
					generatedAt: Date.now(),
					version: this.extensionVersion || "1.0.0",
					tokenCount: 0,
				},
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	/**
	 * Check if Squash extension is installed
	 */
	async isExtensionInstalled(): Promise<boolean> {
		return this.isExtensionAvailable();
	}

	/**
	 * Show install prompt UI
	 */
	async showInstallPrompt(options?: {
		title?: string;
		message?: string;
		theme?: "light" | "dark" | "auto";
	}): Promise<void> {
		this.uiManager.showInstallPrompt(options);
	}

	/**
	 * Enable mock mode (useful for development)
	 */
	enableMockMode(): void {
		this.mockMode = true;
	}

	/**
	 * Disable mock mode
	 */
	disableMockMode(): void {
		this.mockMode = false;
	}

	/**
	 * Track analytics event (if analytics enabled)
	 */
	trackEvent(eventName: string, properties?: Record<string, unknown>): void {
		if (!this.config?.analytics) return;

		// Send to your analytics service
		console.log("Analytics event:", eventName, properties);

		// Example: Google Analytics
		interface WindowWithGtag extends Window {
			gtag?: (
				command: string,
				eventName: string,
				properties?: Record<string, unknown>,
			) => void;
		}

		const windowWithGtag = window as WindowWithGtag;
		if (typeof window !== "undefined" && windowWithGtag.gtag) {
			windowWithGtag.gtag("event", eventName, properties);
		}
	}

	// Private helper methods
	private isExtensionAvailable(): boolean {
		return (
			typeof window !== "undefined" &&
			window.__squashExtension !== undefined &&
			typeof window.__squashExtension.getContext === "function"
		);
	}

	private estimateTokenCount(data: Context): number {
		// Rough estimation: 4 characters per token
		const jsonString = JSON.stringify(data);
		return Math.round(jsonString.length / 4);
	}
}

// Create singleton instance
const squash = new SquashSDK();

// Export types and instance
export * from "./types";
export { squash };
export default squash;
