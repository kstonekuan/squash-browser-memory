/// <reference types="@types/dom-chromium-ai" />

/**
 * AI Provider abstraction interface
 * Allows swapping between Chrome AI and remote AI providers
 */

export interface AISession {
	/**
	 * Send a prompt to the AI and get a response
	 */
	prompt(text: string, options?: LanguageModelPromptOptions): Promise<string>;

	/**
	 * Measure token usage for a given prompt (if supported)
	 */
	measureInputUsage?(
		prompt: string,
		options?: LanguageModelPromptOptions,
	): Promise<number>;

	/**
	 * The input token quota/limit for this session (if available)
	 */
	inputQuota?: number;

	/**
	 * The current input token usage for this session (if available)
	 */
	inputUsage?: number;

	/**
	 * Clean up the session
	 */
	destroy(): void;
}

export interface AIProvider {
	/**
	 * Check if this AI provider is available
	 */
	isAvailable(): Promise<boolean>;

	/**
	 * Get the current status of the AI provider
	 */
	getStatus(): Promise<AIProviderStatus>;

	/**
	 * Create a new AI session
	 */
	createSession(systemPrompt?: string): Promise<AISession | null>;

	/**
	 * Get the provider name for UI display
	 */
	getProviderName(): string;

	/**
	 * Check if the provider requires configuration (like API keys)
	 */
	requiresConfiguration(): boolean;

	/**
	 * Validate the provider configuration
	 */
	validateConfiguration?(): Promise<boolean>;

	/**
	 * Get provider capabilities for optimization
	 */
	getCapabilities(): AIProviderCapabilities;
}

export interface AIProviderCapabilities {
	/**
	 * Maximum input tokens the provider can handle
	 */
	maxInputTokens: number;

	/**
	 * Recommended chunk size for optimal performance
	 */
	optimalChunkTokens: number;

	/**
	 * Whether the provider supports token measurement
	 */
	supportsTokenMeasurement: boolean;
}

export type AIProviderStatus =
	| "available"
	| "unavailable"
	| "needs-configuration"
	| "rate-limited"
	| "error"
	| "downloadable" // Chrome AI specific - model can be downloaded
	| "downloading"; // Chrome AI specific - model is downloading

export type AIProviderType = "chrome" | "claude";

/**
 * Configuration for AI providers
 */
export type AIProviderConfig =
	| {
			provider: "chrome";
	  }
	| {
			provider: "claude";
			claudeApiKey?: string;
	  };
