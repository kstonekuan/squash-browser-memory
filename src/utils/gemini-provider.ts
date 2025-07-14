/// <reference types="@types/dom-chromium-ai" />

/**
 * Gemini AI provider implementation using Google GenAI SDK
 */

import { GoogleGenAI } from "@google/genai";
import type {
	AIProvider,
	AIProviderCapabilities,
	AIProviderStatus,
} from "./ai-interface";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_MAX_OUTPUT_TOKENS = 8192;

export const GEMINI_CONSOLE_URL = "https://aistudio.google.com/apikey";
export const GEMINI_CONSOLE_NAME = "Google AI Studio";

export class GeminiProvider implements AIProvider {
	private apiKey?: string;
	private client?: GoogleGenAI;
	private systemPrompt?: string;

	constructor(apiKey?: string) {
		this.apiKey = apiKey;
		if (apiKey) {
			this.client = new GoogleGenAI({
				apiKey: apiKey,
			});
		}
	}

	async isAvailable(): Promise<boolean> {
		if (!this.apiKey || !this.client) {
			return false;
		}

		// Test API key validity with a minimal request
		try {
			await this.client.models.generateContent({
				model: "gemini-2.0-flash-lite", // Use a cheaper model for availability check
				contents: "test",
			});

			return true;
		} catch (error) {
			console.error("Gemini availability check failed:", error);
			// Check for specific error types that indicate invalid API key
			if (error instanceof Error) {
				if (
					error.message.includes("API_KEY_INVALID") ||
					error.message.includes("401") ||
					error.message.includes("403")
				) {
					return false;
				}
			}
			return false;
		}
	}

	async getStatus(): Promise<AIProviderStatus> {
		if (!this.apiKey) {
			return "needs-configuration";
		}

		try {
			const available = await this.isAvailable();
			return available ? "available" : "error";
		} catch (error) {
			if (error instanceof Error && error.message.includes("429")) {
				return "rate-limited";
			}
			return "error";
		}
	}

	async initialize(systemPrompt?: string): Promise<void> {
		if (!this.apiKey) {
			throw new Error("Gemini API key is required");
		}

		this.systemPrompt = systemPrompt;

		// Ensure client is initialized
		if (!this.client) {
			this.client = new GoogleGenAI({
				apiKey: this.apiKey,
			});
		}

		// Verify the API key is valid
		const available = await this.isAvailable();
		if (!available) {
			throw new Error("Gemini API key is invalid or rate limited");
		}
	}

	async prompt(
		text: string,
		options?: LanguageModelPromptOptions,
	): Promise<string> {
		if (!this.client) {
			throw new Error("Gemini not initialized. Call initialize() first.");
		}

		console.log("Gemini API: Sending message");

		// Handle JSON schema constraint
		let userContent = text;
		if (options?.responseConstraint) {
			// Add instruction to return JSON matching the schema
			userContent += `\n\nIMPORTANT: Respond with valid JSON only, matching this schema: ${JSON.stringify(options.responseConstraint)}`;
		}

		try {
			console.log(
				"Request content (truncated):",
				`${userContent.substring(0, 200)}...`,
			);

			// Prepare the full prompt with system prompt if available
			let fullPrompt = userContent;
			if (this.systemPrompt) {
				fullPrompt = `${this.systemPrompt}\n\n${userContent}`;
			}

			const response = await this.client.models.generateContent({
				model: GEMINI_MODEL,
				contents: fullPrompt,
				config: {
					maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
					thinkingConfig: {
						thinkingBudget: 2048, // Disable thinking for faster responses
					},
				},
			});

			console.log("Response received");

			const text = response.text;
			if (!text) {
				throw new Error("No text response from Gemini API");
			}

			return text;
		} catch (error) {
			console.error("Gemini API Error:", error);

			// Convert SDK errors to match existing error handling
			if (error instanceof Error) {
				if (
					error.message.includes("429") ||
					error.message.includes("RATE_LIMIT")
				) {
					throw new DOMException("Rate limit exceeded", "QuotaExceededError");
				}

				if (
					error.message.includes("401") ||
					error.message.includes("API_KEY_INVALID")
				) {
					throw new Error(
						"Invalid Gemini API key. Please check your API key in Advanced Settings.",
					);
				}

				throw new Error(`Gemini API error: ${error.message}`);
			}

			throw error;
		}
	}

	async measureInputUsage(
		prompt: string,
		options?: LanguageModelPromptOptions,
	): Promise<number> {
		if (!this.client) {
			throw new Error("Gemini not initialized. Call initialize() first.");
		}

		// Build the full message content including any response constraints
		let userContent = prompt;
		if (options?.responseConstraint) {
			userContent += `\n\nIMPORTANT: Respond with valid JSON only, matching this schema: ${JSON.stringify(options.responseConstraint)}`;
		}

		// Prepare the full prompt with system prompt if available
		let fullPrompt = userContent;
		if (this.systemPrompt) {
			fullPrompt = `${this.systemPrompt}\n\n${userContent}`;
		}

		try {
			const result = await this.client.models.countTokens({
				model: GEMINI_MODEL,
				contents: fullPrompt,
			});

			return result.totalTokens || 0;
		} catch (error) {
			console.error("Error counting tokens:", error);
			// Fall back to estimation if API fails (rough approximation: 4 chars per token)
			return Math.ceil(fullPrompt.length / 4);
		}
	}

	getProviderName(): string {
		return "Gemini API";
	}

	requiresConfiguration(): boolean {
		return true;
	}

	async validateConfiguration(): Promise<boolean> {
		return this.isAvailable();
	}

	setApiKey(apiKey: string): void {
		this.apiKey = apiKey;
		this.client = new GoogleGenAI({
			apiKey: apiKey,
		});
	}

	getCapabilities(): AIProviderCapabilities {
		return {
			maxInputTokens: 2000000, // Gemini 2.5 Flash supports 2M input tokens
			optimalChunkTokens: 100000, // Optimal chunk size for Gemini 2.5 Flash
			supportsTokenMeasurement: true, // Gemini API provides token counting via countTokens()
		};
	}
}
