/// <reference types="@types/dom-chromium-ai" />

/**
 * Remote AI provider implementation using Claude API
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
	AIProvider,
	AIProviderCapabilities,
	AIProviderStatus,
	AISession,
} from "./ai-interface";

const CLAUDE_MODEL = "claude-3-5-haiku-latest";
const CLAUDE_MAX_TOKENS = 8192;

class ClaudeSession implements AISession {
	private client: Anthropic;
	private systemPrompt: string;

	constructor(apiKey: string, systemPrompt: string) {
		this.client = new Anthropic({
			apiKey: apiKey,
			dangerouslyAllowBrowser: true, // Required for browser usage
		});
		this.systemPrompt = systemPrompt;
	}

	async prompt(
		text: string,
		options?: LanguageModelPromptOptions,
	): Promise<string> {
		console.log("Claude API: Sending message");

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

			console.log("Response received");

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
		// Claude doesn't provide a direct token count API for input
		// Use a rough estimation: ~4 characters per token
		const baseTokens = Math.ceil(prompt.length / 4);

		// Add system prompt tokens if present
		const systemTokens = this.systemPrompt
			? Math.ceil(this.systemPrompt.length / 4)
			: 0;

		// Add constraint tokens if present
		const constraintTokens = options?.responseConstraint
			? Math.ceil(JSON.stringify(options.responseConstraint).length / 4)
			: 0;

		return baseTokens + systemTokens + constraintTokens;
	}

	destroy(): void {
		// No cleanup needed for HTTP-based API
	}
}

export class ClaudeProvider implements AIProvider {
	private apiKey?: string;

	constructor(apiKey?: string) {
		this.apiKey = apiKey;
	}

	async isAvailable(): Promise<boolean> {
		if (!this.apiKey) {
			return false;
		}

		// Use SDK to check if API key is valid by making a minimal request
		try {
			const client = new Anthropic({
				apiKey: this.apiKey,
				dangerouslyAllowBrowser: true,
			});

			// Use token counting which is cheaper and doesn't consume generation tokens
			await client.messages.countTokens({
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

	async createSession(systemPrompt: string): Promise<AISession | null> {
		if (!this.apiKey) {
			throw new Error("Claude API key is required");
		}

		const available = await this.isAvailable();
		if (!available) {
			return null;
		}

		return new ClaudeSession(this.apiKey, systemPrompt);
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

	setApiKey(apiKey: string): void {
		this.apiKey = apiKey;
	}

	getCapabilities(): AIProviderCapabilities {
		return {
			maxInputTokens: 200000, // Claude 3.5 Haiku supports 200K input tokens
			optimalChunkTokens: 50000, // Optimal chunk size for Claude 3.5 Haiku
			supportsTokenMeasurement: false, // Claude API doesn't provide direct token measurement
		};
	}
}
