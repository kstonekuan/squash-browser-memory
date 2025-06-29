/// <reference types="@types/dom-chromium-ai" />

import type {
	AIProvider,
	AIProviderCapabilities,
	AIProviderStatus,
	AISession,
	PromptOptions,
} from "./ai-interface";

/**
 * Chrome AI Session wrapper implementing AISession interface
 */
export class ChromeAISession implements AISession {
	private session: LanguageModel;

	constructor(session: LanguageModel) {
		this.session = session;
	}

	async prompt(text: string, options?: PromptOptions): Promise<string> {
		try {
			return await this.session.prompt(text, options);
		} catch (error) {
			console.error("Chrome AI Error:", error);
			throw error;
		}
	}

	async measureInputUsage(
		prompt: string,
		options?: PromptOptions,
	): Promise<number> {
		return await this.session.measureInputUsage(prompt, options);
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

			if (available === "available") {
				return "available";
			}
			return "unavailable";
		} catch (error) {
			console.error("Error getting AI model status:", error);
			return "unavailable";
		}
	}

	async createSession(systemPrompt?: string): Promise<AISession | null> {
		try {
			const isAvailable = await this.isAvailable();
			if (!isAvailable) {
				return null;
			}

			const session = await LanguageModel.create({
				initialPrompts: [
					{
						role: "system",
						content:
							systemPrompt ||
							"You are a helpful assistant that analyzes browsing patterns.",
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
		return {
			maxInputTokens: 1024, // Chrome AI has a very limited context window
			optimalChunkTokens: 800, // Leave some margin for system prompts and response constraint
			supportsTokenMeasurement: true, // Chrome AI supports measureInputUsage
		};
	}
}

// Legacy functions for backward compatibility
export async function isAIModelAvailable(): Promise<boolean> {
	const provider = new ChromeAIProvider();
	return provider.isAvailable();
}

export async function getAIModelStatus(): Promise<Availability> {
	try {
		if (typeof LanguageModel === "undefined") {
			return "unavailable";
		}

		const available = await LanguageModel.availability();
		return available;
	} catch (error) {
		console.error("Error getting AI model status:", error);
		return "unavailable";
	}
}

export async function createChromeAISession(
	systemPrompt?: string,
): Promise<LanguageModel | null> {
	const provider = new ChromeAIProvider();
	const session = await provider.createSession(systemPrompt);

	if (session instanceof ChromeAISession) {
		// @ts-ignore - Accessing private property for backward compatibility
		return session.session;
	}

	return null;
}

export async function promptChromeAI(
	session: LanguageModel,
	text: string,
	options?: { responseConstraint?: Record<string, unknown> },
): Promise<string> {
	try {
		return await session.prompt(text, options);
	} catch (error) {
		console.error("Chrome AI Error:", error);
		throw error;
	}
}
