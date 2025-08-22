/// <reference types="@types/dom-chromium-ai" />

/**
 * OpenAI API provider implementation
 */

import OpenAI, { type ClientOptions } from "openai";
import type {
	AIProvider,
	AIProviderCapabilities,
	AIProviderStatus,
} from "./ai-interface";

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const OPENAI_MAX_OUTPUT_TOKENS = 16384;

export const OPENAI_CONSOLE_URL = "https://platform.openai.com/api-keys";
export const OPENAI_CONSOLE_NAME = "OpenAI Platform";

export class OpenAIProvider implements AIProvider {
	private apiKey?: string;
	private baseUrl?: string;
	private model: string;
	private client?: OpenAI;
	private systemPrompt?: string;

	constructor(apiKey?: string, baseUrl?: string, model?: string) {
		this.apiKey = apiKey;
		this.baseUrl = baseUrl;
		this.model = model || DEFAULT_OPENAI_MODEL;

		if (apiKey) {
			const config: ClientOptions = {
				apiKey: apiKey,
				dangerouslyAllowBrowser: true, // Required for browser usage
			};

			if (baseUrl) {
				config.baseURL = baseUrl;
			}

			this.client = new OpenAI(config);
		}
	}

	async isAvailable(): Promise<boolean> {
		if (!this.apiKey || !this.client) {
			return false;
		}

		// Test API key validity with a minimal request
		try {
			// Use the models endpoint to check if the API key is valid
			await this.client.models.list();
			return true;
		} catch (error) {
			console.error("OpenAI availability check failed:", error);
			if (error instanceof OpenAI.APIError) {
				// API key is invalid if we get 401 or 403
				if (error.status === 401 || error.status === 403) {
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
			throw new Error("OpenAI API key is required");
		}

		this.systemPrompt = systemPrompt;

		// Ensure client is initialized
		if (!this.client) {
			const config: ClientOptions = {
				apiKey: this.apiKey,
				dangerouslyAllowBrowser: true,
			};

			if (this.baseUrl) {
				config.baseURL = this.baseUrl;
			}

			this.client = new OpenAI(config);
		}

		// Verify the API key is valid
		const available = await this.isAvailable();
		if (!available) {
			throw new Error("OpenAI API key is invalid or rate limited");
		}
	}

	async prompt(
		text: string,
		options?: LanguageModelPromptOptions,
	): Promise<string> {
		if (!this.client) {
			throw new Error("OpenAI not initialized. Call initialize() first.");
		}

		console.log("OpenAI API: Sending message with model", this.model);

		// Build messages array
		const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

		if (this.systemPrompt) {
			messages.push({
				role: "system",
				content: this.systemPrompt,
			});
		}

		// Handle JSON schema constraint
		let userContent = text;
		if (options?.responseConstraint) {
			// Add instruction to return JSON matching the schema
			userContent += `\n\nIMPORTANT: Respond with valid JSON only, matching this schema: ${JSON.stringify(options.responseConstraint)}`;
		}

		messages.push({
			role: "user",
			content: userContent,
		});

		try {
			console.log("Request content:", `${userContent.substring(0, 100)}...`);

			const completion = await this.client.chat.completions.create(
				{
					model: this.model,
					messages: messages,
					max_tokens: OPENAI_MAX_OUTPUT_TOKENS,
					temperature: 0.7,
					response_format: options?.responseConstraint
						? { type: "json_object" }
						: undefined,
				},
				{
					signal: options?.signal,
				},
			);

			const response = completion.choices[0]?.message?.content;

			if (!response) {
				throw new Error("No response from OpenAI API");
			}

			console.log("Response received", response);

			return response;
		} catch (error) {
			console.error("OpenAI API Error:", error);

			// Convert SDK errors to match existing error handling
			if (error instanceof OpenAI.APIError) {
				if (error.status === 429) {
					throw new DOMException("Rate limit exceeded", "QuotaExceededError");
				}

				if (error.status === 401) {
					throw new Error(
						"Invalid OpenAI API key. Please check your API key in Advanced Settings.",
					);
				}

				throw new Error(`OpenAI API error (${error.status}): ${error.message}`);
			}

			throw error;
		}
	}

	async measureInputUsage(
		prompt: string,
		options?: LanguageModelPromptOptions,
	): Promise<number> {
		if (!this.client) {
			throw new Error("OpenAI not initialized. Call initialize() first.");
		}

		// Build the full message content including any response constraints
		let userContent = prompt;
		if (options?.responseConstraint) {
			userContent += `\n\nIMPORTANT: Respond with valid JSON only, matching this schema: ${JSON.stringify(options.responseConstraint)}`;
		}

		// Estimate tokens using tiktoken-style approximation
		// OpenAI uses ~4 characters per token on average
		const systemLength = this.systemPrompt?.length || 0;
		const userLength = userContent.length;
		const totalLength = systemLength + userLength;

		// Add some overhead for message structure
		const overhead = 10; // Account for role tokens and message structure

		return Math.ceil(totalLength / 4) + overhead;
	}

	getProviderName(): string {
		return `OpenAI (${this.model})`;
	}

	requiresConfiguration(): boolean {
		return true;
	}

	async validateConfiguration(): Promise<boolean> {
		return this.isAvailable();
	}

	getCapabilities(): AIProviderCapabilities {
		// Set some reasonable defaults for now
		return {
			maxInputTokens: 128000,
			optimalChunkTokens: 50000,
			supportsTokenMeasurement: true,
		};
	}
}
