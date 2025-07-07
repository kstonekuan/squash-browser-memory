/// <reference types="@types/dom-chromium-ai" />

import ChromiumAI, { type ChromiumAIInstance } from "simple-chromium-ai";
import { match } from "ts-pattern";
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

		if (result.isErr()) {
			console.error("Error initializing Chrome AI:", result.error);
			throw result.error;
		}

		const value = result.value;

		// Use ts-pattern to match on the tagged union
		match(value)
			.with({ type: "initialized" }, ({ instance }) => {
				// We got an instance - model is ready
				this.aiInstance = instance;
			})
			.with({ type: "needs-download" }, () => {
				// Chrome AI needs to be downloaded - user must do this manually
				// Don't throw - let the UI handle showing instructions
			})
			.exhaustive();
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

		if (result.isErr()) {
			console.error("Chrome AI Error:", result.error);
			throw result.error;
		}

		return result.value;
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
		if (result.isErr()) {
			throw result.error;
		}

		return result.value.promptTokens;
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
