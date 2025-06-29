/// <reference types="@types/dom-chromium-ai" />

export type ChromeAIAvailability = 'available' | 'unavailable' | 'downloadable' | 'downloading';

export interface ChromeAISession {
	prompt: (text: string) => Promise<string>;
	destroy: () => void;
}

/**
 * Check if Chrome's Language Model API is available
 */
export async function isAIModelAvailable(): Promise<boolean> {
	try {
		if (typeof chrome === 'undefined') {
			console.error('Chrome API is not available');
			return false;
		}

		// Check if we're running Chrome 131+
		const userAgent = navigator.userAgent;
		const chromeMatch = userAgent.match(/Chrome\/(\d+)/);
		if (chromeMatch) {
			const version = parseInt(chromeMatch[1], 10);
			if (version < 131) {
				console.error(`Chrome version ${version} is too old. Version 131+ required.`);
				return false;
			}
		}

		// @ts-ignore - LanguageModel may not be available
		if (typeof self.ai?.languageModel === 'undefined') {
			console.error('LanguageModel API is not available in this browser');
			return false;
		}

		// @ts-ignore
		const available = await self.ai.languageModel.capabilities();
		
		if (available.available === 'no') {
			console.error('AI model not available, status:', available.available);
			return false;
		}

		return true;
	} catch (error) {
		console.error('Error checking AI model availability:', error);
		return false;
	}
}

/**
 * Get the current availability status of Chrome's Language Model
 */
export async function getAIModelStatus(): Promise<ChromeAIAvailability> {
	try {
		// @ts-ignore
		if (typeof self.ai?.languageModel === 'undefined') {
			return 'unavailable';
		}

		// @ts-ignore
		const capabilities = await self.ai.languageModel.capabilities();
		
		switch (capabilities.available) {
			case 'readily':
				return 'available';
			case 'after-download':
				return 'downloadable';
			case 'no':
			default:
				return 'unavailable';
		}
	} catch (error) {
		console.error('Error getting AI model status:', error);
		return 'unavailable';
	}
}

/**
 * Create a Chrome AI session for generating content
 */
export async function createChromeAISession(systemPrompt?: string): Promise<ChromeAISession | null> {
	try {
		const isAvailable = await isAIModelAvailable();
		if (!isAvailable) {
			return null;
		}

		// @ts-ignore
		const session = await self.ai.languageModel.create({
			systemPrompt: systemPrompt || 'You are a helpful assistant that analyzes browsing patterns.',
		});

		return {
			prompt: async (text: string) => {
				try {
					return await session.prompt(text);
				} catch (error) {
					console.error('Error during Chrome AI prompt:', error);
					throw error;
				}
			},
			destroy: () => {
				try {
					session.destroy();
				} catch (error) {
					console.error('Error destroying Chrome AI session:', error);
				}
			},
		};
	} catch (error) {
		console.error('Error creating Chrome AI session:', error);
		return null;
	}
}

/**
 * Parse JSON from Chrome AI response with error handling
 */
export function parseAIResponse<T>(response: string, defaultValue: T): T {
	try {
		// Chrome AI might return markdown-wrapped JSON
		const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
		if (jsonMatch) {
			return JSON.parse(jsonMatch[1]);
		}
		
		// Try direct JSON parse
		return JSON.parse(response);
	} catch (error) {
		console.error('Failed to parse Chrome AI response:', error);
		console.debug('Raw response:', response);
		return defaultValue;
	}
}

/**
 * Generate a prompt that encourages JSON output
 */
export function createJSONPrompt(prompt: string): string {
	return `${prompt}

IMPORTANT: Return your response as valid JSON only, with no additional text or markdown formatting.`;
}