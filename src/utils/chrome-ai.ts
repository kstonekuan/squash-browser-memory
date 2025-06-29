/// <reference types="@types/dom-chromium-ai" />

export interface ChromeAISession {
	prompt: (
		text: string,
		options?: { responseConstraint?: Record<string, unknown> },
	) => Promise<string>;
	destroy: () => void;
}

/**
 * Check if Chrome's Language Model API is available
 */
export async function isAIModelAvailable(): Promise<boolean> {
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

/**
 * Get the current availability status of Chrome's Language Model
 */
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

/**
 * Create a Chrome AI session for generating content
 */
export async function createChromeAISession(
	systemPrompt?: string,
): Promise<ChromeAISession | null> {
	try {
		const isAvailable = await isAIModelAvailable();
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

		return {
			prompt: async (
				text: string,
				options?: { responseConstraint?: Record<string, unknown> },
			) => {
				try {
					// Note: Token tracking methods (tokensSoFar, maxTokens, tokensLeft, tokenCount)
					// are documented but not yet available in current Chrome AI implementation

					return await session.prompt(text, options);
				} catch (error) {
					// Check if it's a quota exceeded error
					if (
						error instanceof DOMException &&
						error.name === "QuotaExceededError"
					) {
						// QuotaExceededError can mean:
						// 1. Input exceeds 1024 token limit per prompt
						// 2. Session context exceeds 4096 token limit
						const errorMessage = error.message?.toLowerCase() || "";
						if (
							errorMessage.includes("input") ||
							errorMessage.includes("token") ||
							errorMessage.includes("long")
						) {
							console.error(
								"Chrome AI input too long. Prompt exceeds 1024 token limit or session context full (4096 tokens).",
							);
							throw new Error(`Chrome AI input too long: ${error.message}`);
						}
						console.error("Chrome AI quota exceeded.");
						throw new Error(`Chrome AI quota exceeded: ${error.message}`);
					}
					console.error("Error during Chrome AI prompt:", error);
					throw error;
				}
			},
			destroy: () => {
				try {
					session.destroy();
				} catch (error) {
					console.error("Error destroying Chrome AI session:", error);
				}
			},
		};
	} catch (error) {
		console.error("Error creating Chrome AI session:", error);
		return null;
	}
}
