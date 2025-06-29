/// <reference types="@types/dom-chromium-ai" />

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
): Promise<LanguageModel | null> {
	try {
		const isAvailable = await isAIModelAvailable();
		if (!isAvailable) {
			return null;
		}

		return await LanguageModel.create({
			initialPrompts: [
				{
					role: "system",
					content:
						systemPrompt ||
						"You are a helpful assistant that analyzes browsing patterns.",
				},
			],
		});
	} catch (error) {
		console.error("Error creating Chrome AI session:", error);
		return null;
	}
}

/**
 * Prompt the Chrome AI with error handling
 */
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
