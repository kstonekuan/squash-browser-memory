/// <reference types="@types/dom-chromium-ai" />

import ChromiumAI, { type ChromiumAIInstance } from "simple-chromium-ai";
import type {
	AIProvider,
	AIProviderCapabilities,
	AIProviderStatus,
} from "./ai-interface";

/**
 * Chrome AI Provider implementing AIProvider interface using simple-chromium-ai
 */
export class ChromeAIProvider implements AIProvider {
	private aiInstance: ChromiumAIInstance | null = null;

	async isAvailable(): Promise<boolean> {
		return this.aiInstance !== null;
	}

	async getStatus(): Promise<AIProviderStatus> {
		// Simple status based on whether we have an initialized instance
		return this.aiInstance ? "available" : "unavailable";
	}

	async initialize(systemPrompt?: string): Promise<void> {
		// Initialize with the system prompt
		const result = await ChromiumAI.Safe.initialize(systemPrompt);

		result.match(
			(initResult) => {
				// Success: The result is the initialized instance
				this.aiInstance = initResult;
			},
			(error) => {
				// Error: Log and throw
				console.error("Error initializing Chrome AI:", error);
				throw error;
			},
		);
	}

	async prompt(
		text: string,
		options?: LanguageModelPromptOptions,
	): Promise<string> {
		if (!this.aiInstance) {
			throw new Error("Chrome AI not initialized. Call initialize() first.");
		}

		const result = await ChromiumAI.Safe.prompt(
			this.aiInstance,
			text,
			undefined, // no timeout
			options, // This includes responseConstraint if provided
			undefined, // no additional session options
		);

		return result.match(
			(response) => {
				console.log("Response received (trimmed)", response.trim());
				return response;
			},
			(error) => {
				console.error("Chrome AI Error:", error);
				throw error;
			},
		);
	}

	async measureInputUsage(
		prompt: string,
		_options?: LanguageModelPromptOptions,
	): Promise<number> {
		if (!this.aiInstance) {
			throw new Error("Chrome AI not initialized. Call initialize() first.");
		}

		const result = await ChromiumAI.Safe.checkTokenUsage(
			this.aiInstance,
			prompt,
		);

		return result.match(
			(usage) => usage.promptTokens,
			(error) => {
				console.error("Error counting tokens:", error);
				// Fall back to estimation: ~4 chars per token
				return Math.ceil(
					(prompt.length + (this.aiInstance?.systemPrompt?.length || 0)) / 4,
				);
			},
		);
	}

	getProviderName(): string {
		return "Chrome AI";
	}

	requiresConfiguration(): boolean {
		return false;
	}

	getCapabilities(): AIProviderCapabilities {
		// These are just fallback values - actual limits are determined dynamically
		// Chrome AI's actual quota varies and should be checked via checkTokenUsage
		return {
			maxInputTokens: 1024, // Fallback only - use checkTokenUsage for actual value
			optimalChunkTokens: 1024, // Fallback only - use checkTokenUsage for actual value
			supportsTokenMeasurement: true, // Chrome AI supports measureInputUsage
		};
	}
}
