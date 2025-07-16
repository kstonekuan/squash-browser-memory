/// <reference types="@types/dom-chromium-ai" />

/**
 * Claude AI provider implementation using Anthropic SDK
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
	AIProvider,
	AIProviderCapabilities,
	AIProviderStatus,
} from "./ai-interface";

const CLAUDE_MODEL = "claude-3-5-haiku-latest";
const CLAUDE_MAX_TOKENS = 8192;

export const CLAUDE_CONSOLE_URL = "https://console.anthropic.com/";
export const CLAUDE_CONSOLE_NAME = "Anthropic Console";

export class ClaudeProvider implements AIProvider {
	private apiKey?: string;
	private client?: Anthropic;
	private systemPrompt?: string;

	constructor(apiKey?: string) {
		this.apiKey = apiKey;
		if (apiKey) {
			this.client = new Anthropic({
				apiKey: apiKey,
				dangerouslyAllowBrowser: true, // Required for browser usage
			});
		}
	}

	async isAvailable(): Promise<boolean> {
		if (!this.apiKey || !this.client) {
			return false;
		}

		// Use SDK to check if API key is valid by making a minimal request
		try {
			// Use token counting which is cheaper and doesn't consume generation tokens
			await this.client.messages.countTokens({
				model: CLAUDE_MODEL,
				messages: [{ role: "user", content: "test" }],
			});

			return true;
		} catch (error) {
			if (error instanceof Anthropic.APIError) {
				// API key is invalid if we get 401 or 403
				if (error.status === 401 || error.status === 403) {
					return false;
				}
			}
			console.error("Claude availability check failed:", error);
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
			throw new Error("Claude API key is required");
		}

		this.systemPrompt = systemPrompt;

		// Ensure client is initialized
		if (!this.client) {
			this.client = new Anthropic({
				apiKey: this.apiKey,
				dangerouslyAllowBrowser: true,
			});
		}

		// Verify the API key is valid
		const available = await this.isAvailable();
		if (!available) {
			throw new Error("Claude API key is invalid or rate limited");
		}
	}

	async prompt(
		text: string,
		options?: LanguageModelPromptOptions,
	): Promise<string> {
		if (!this.client) {
			throw new Error("Claude not initialized. Call initialize() first.");
		}

		console.log("Claude API: Sending message");

		// Handle JSON schema constraint
		let userContent = text;
		if (options?.responseConstraint) {
			// Add instruction to return JSON matching the schema
			userContent += `\n\nIMPORTANT: Respond with valid JSON only, matching this schema: ${JSON.stringify(options.responseConstraint)}`;
		}

		try {
			console.log("Request content:", `${userContent.toString()}...`);

			const message = await this.client.messages.create(
				{
					model: CLAUDE_MODEL,
					max_tokens: CLAUDE_MAX_TOKENS,
					system: this.systemPrompt,
					messages: [
						{
							role: "user",
							content: userContent,
						},
					],
				},
				{
					signal: options?.signal,
				},
			);

			console.log("Response received", message.content);

			// Handle the response content array
			const content = message.content[0];
			if (content.type === "text") {
				return content.text;
			}

			throw new Error("Unexpected response type from Claude API");
		} catch (error) {
			console.error("Claude API Error:", error);

			// Convert SDK errors to match existing error handling
			if (error instanceof Anthropic.APIError) {
				if (error.status === 429) {
					throw new DOMException("Rate limit exceeded", "QuotaExceededError");
				}

				if (error.status === 401) {
					throw new Error(
						"Invalid Claude API key. Please check your API key in Advanced Settings.",
					);
				}

				throw new Error(`Claude API error (${error.status}): ${error.message}`);
			}

			throw error;
		}
	}

	async measureInputUsage(
		prompt: string,
		options?: LanguageModelPromptOptions,
	): Promise<number> {
		if (!this.client) {
			throw new Error("Claude not initialized. Call initialize() first.");
		}

		// Build the full message content including any response constraints
		let userContent = prompt;
		if (options?.responseConstraint) {
			userContent += `\n\nIMPORTANT: Respond with valid JSON only, matching this schema: ${JSON.stringify(options.responseConstraint)}`;
		}

		try {
			// Use Claude's actual token counting API
			const result = await this.client.messages.countTokens({
				model: CLAUDE_MODEL,
				system: this.systemPrompt,
				messages: [
					{
						role: "user",
						content: userContent,
					},
				],
			});

			return result.input_tokens;
		} catch (error) {
			console.error("Error counting tokens:", error);
			// Fall back to estimation if API fails
			return Math.ceil((prompt.length + (this.systemPrompt?.length || 0)) / 4);
		}
	}

	getProviderName(): string {
		return "Claude API";
	}

	requiresConfiguration(): boolean {
		return true;
	}

	async validateConfiguration(): Promise<boolean> {
		return this.isAvailable();
	}

	getCapabilities(): AIProviderCapabilities {
		return {
			maxInputTokens: 200000, // Claude 3.5 Haiku supports 200K input tokens
			optimalChunkTokens: 50000, // Optimal chunk size for Claude 3.5 Haiku
			supportsTokenMeasurement: true, // Claude API provides token counting via countTokens()
		};
	}
}
