/// <reference types="@types/dom-chromium-ai" />

import type {
	AIProvider,
	AIProviderCapabilities,
	AIProviderStatus,
	AISession,
} from "./ai-interface";

/**
 * Chrome AI Session wrapper implementing AISession interface
 */
class ChromeAISession implements AISession {
	private session: LanguageModel;

	constructor(session: LanguageModel) {
		this.session = session;
	}

	async prompt(
		text: string,
		options?: LanguageModelPromptOptions,
	): Promise<string> {
		try {
			return await this.session.prompt(text, options);
		} catch (error) {
			console.error("Chrome AI Error:", error);
			throw error;
		}
	}

	async measureInputUsage(
		prompt: string,
		options?: LanguageModelPromptOptions,
	): Promise<number> {
		return await this.session.measureInputUsage(prompt, options);
	}

	get inputQuota(): number {
		return this.session.inputQuota;
	}

	get inputUsage(): number {
		return this.session.inputUsage;
	}

	destroy(): void {
		this.session.destroy();
	}
}

/**
 * Chrome AI Provider implementing AIProvider interface
 */
export class ChromeAIProvider implements AIProvider {
	async isAvailable(): Promise<boolean> {
		try {
			// Check if the LanguageModel API exists
			if (typeof LanguageModel === "undefined") {
				console.error("LanguageModel API is not available in this browser");
				return false;
			}

			// Check actual availability status
			const available = await LanguageModel.availability();

			if (available === "unavailable") {
				console.error("AI model not available, status:", available);
				return false;
			}

			return true;
		} catch (error) {
			console.error("Error checking AI model availability:", error);
			return false;
		}
	}

	async getStatus(): Promise<AIProviderStatus> {
		try {
			if (typeof LanguageModel === "undefined") {
				return "unavailable";
			}

			const available = await LanguageModel.availability();

			// Return the Chrome AI availability status directly
			// This includes "available", "unavailable", "downloadable", "downloading"
			return available;
		} catch (error) {
			console.error("Error getting AI model status:", error);
			return "unavailable";
		}
	}

	async createSession(systemPrompt: string): Promise<AISession | null> {
		try {
			const isAvailable = await this.isAvailable();
			if (!isAvailable) {
				return null;
			}

			const session = await LanguageModel.create({
				initialPrompts: [
					{
						role: "system",
						content: systemPrompt,
					},
				],
			});

			return new ChromeAISession(session);
		} catch (error) {
			console.error("Error creating Chrome AI session:", error);
			return null;
		}
	}

	getProviderName(): string {
		return "Chrome AI";
	}

	requiresConfiguration(): boolean {
		return false;
	}

	getCapabilities(): AIProviderCapabilities {
		// These are just fallback values - actual limits are determined dynamically from session.inputQuota
		// Chrome AI's actual quota varies and should be checked via session.getInputQuota()
		return {
			maxInputTokens: 1024, // Fallback only - use session.getInputQuota() for actual value
			optimalChunkTokens: 1024, // Fallback only - use session.getInputQuota() for actual value
			supportsTokenMeasurement: true, // Chrome AI supports measureInputUsage
		};
	}
}
