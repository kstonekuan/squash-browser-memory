/**
 * Squash SDK Type Definitions
 */

export interface SquashConfig {
	/** Your application name (shown in permission dialog) */
	appName: string;
	/** Unique identifier for your application */
	appId: string;
	/** Show install prompt if extension not found (default: true) */
	installPrompt?: boolean;
	/** Use mock data in development (default: false) */
	mockMode?: boolean;
	/** Enable analytics tracking (default: false) */
	analytics?: boolean;
	/** UI theme for install prompts (default: 'auto') */
	theme?: "light" | "dark" | "auto";
}

export interface InitResult {
	/** Whether SDK is initialized */
	initialized: boolean;
	/** Whether Squash extension is installed */
	extensionInstalled: boolean;
	/** Whether permission was granted */
	permissionGranted: boolean;
	/** Extension version */
	version?: string;
	/** Whether this is the first permission request */
	isFirstTime: boolean;
}

export interface ContextOptions {
	/** Filter context to match specific topics/domains */
	relevanceQuery?: string;
	/** Time window for context: "1h", "24h", "7d", "30d", "all" */
	timeRange?: string;
	/** Maximum tokens to return (default: 1500) */
	maxTokens?: number;
	/** Response format (default: "structured") */
	format?: "raw" | "structured" | "narrative";
}

export interface Pattern {
	name: string;
	description?: string;
	frequency: number;
	lastSeen: number;
}

export interface Topic {
	topic: string;
	relevance: number;
	keywords: string[];
}

export interface Activity {
	activity: string;
	timestamp: number;
	relevance: number;
}

export interface Context {
	/** Human-readable summary of browsing patterns */
	summary: string;
	/** Detected workflow patterns */
	patterns: Pattern[];
	/** Key topics/domains of interest */
	topics: Topic[];
	/** Recent relevant activities */
	recentActivities: Activity[];
}

export interface ContextMetadata {
	generatedAt: number;
	version: string;
	tokenCount: number;
	isMockData?: boolean;
}

export type ContextStatus =
	| "success"
	| "not_initialized"
	| "not_installed"
	| "permission_denied"
	| "error";

export interface ContextResult {
	/** Status of the context request */
	status: ContextStatus;
	/** Context data (present when status === 'success') */
	context?: Context;
	/** Metadata about the response */
	metadata: ContextMetadata;
	/** Chrome Web Store URL when not_installed */
	installUrl?: string;
	/** Error message when status === 'error' */
	error?: string;
}

export interface ExtensionAPI {
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

declare global {
	interface Window {
		__squashExtension?: ExtensionAPI;
	}
}
