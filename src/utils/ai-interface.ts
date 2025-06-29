/**
 * AI Provider abstraction interface
 * Allows swapping between Chrome AI and remote AI providers
 */

export interface AISession {
	/**
	 * Send a prompt to the AI and get a response
	 */
	prompt(text: string, options?: PromptOptions): Promise<string>;

	/**
	 * Measure token usage for a given prompt (if supported)
	 */
	measureInputUsage?(prompt: string, options?: PromptOptions): Promise<number>;

	/**
	 * Clean up the session
	 */
	destroy(): void;
}

export interface PromptOptions {
	responseConstraint?: Record<string, unknown>;
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
	| "error";

export type AIProviderType = "chrome" | "claude";

/**
 * Configuration for AI providers
 */
export interface AIProviderConfig {
	provider: AIProviderType;
	claudeApiKey?: string;
}
