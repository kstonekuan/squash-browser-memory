/**
 * Remote AI provider implementation using Claude API
 */

import type {
	AIProvider,
	AIProviderCapabilities,
	AIProviderStatus,
	AISession,
	PromptOptions,
} from "./ai-interface";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_API_VERSION = "2023-06-01";
const CLAUDE_MODEL = "claude-3-5-haiku-20241022";
const CLAUDE_MAX_TOKENS = 8192;

export class ClaudeSession implements AISession {
	private apiKey: string;
	private systemPrompt?: string;

	constructor(apiKey: string, systemPrompt?: string) {
		this.apiKey = apiKey;
		this.systemPrompt = systemPrompt;
	}

	async prompt(text: string, options?: PromptOptions): Promise<string> {
		const headers = {
			"Content-Type": "application/json",
			"x-api-key": this.apiKey,
			"anthropic-version": CLAUDE_API_VERSION,
			"anthropic-dangerous-direct-browser-access": "true",
		};

		console.log("Claude API Headers being sent:", headers);
		console.log("Requesting URL:", CLAUDE_API_URL);

		const messages = [
			{
				role: "user",
				content: text,
			},
		];

		interface ClaudeRequestBody {
			model: string;
			max_tokens: number;
			messages: Array<{ role: string; content: string }>;
			system?: string;
		}

		const body: ClaudeRequestBody = {
			model: CLAUDE_MODEL,
			max_tokens: CLAUDE_MAX_TOKENS,
			messages,
		};

		// Add system prompt if provided
		if (this.systemPrompt) {
			body.system = this.systemPrompt;
		}

		// Handle JSON schema constraint
		if (options?.responseConstraint) {
			// Add instruction to return JSON matching the schema
			const jsonInstruction = `\n\nIMPORTANT: Respond with valid JSON only, matching this schema: ${JSON.stringify(options.responseConstraint)}`;
			body.messages[0].content += jsonInstruction;
		}

		try {
			console.log("Request body:", JSON.stringify(body, null, 2));

			const response = await fetch(CLAUDE_API_URL, {
				method: "POST",
				headers,
				body: JSON.stringify(body),
			});

			console.log("Response status:", response.status);
			console.log(
				"Response headers:",
				Object.fromEntries(response.headers.entries()),
			);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));

				console.error("Claude API Error Response:", {
					status: response.status,
					statusText: response.statusText,
					headers: Object.fromEntries(response.headers.entries()),
					errorData,
				});

				if (response.status === 429) {
					throw new DOMException("Rate limit exceeded", "QuotaExceededError");
				}

				if (response.status === 401) {
					throw new Error(
						"Invalid Claude API key. Please check your API key in Advanced Settings.",
					);
				}

				if (response.status === 405) {
					throw new Error(
						"Method not allowed. This might be due to an invalid model name or API endpoint.",
					);
				}

				throw new Error(
					`Claude API error (${response.status}): ${
						errorData.error?.message || errorData.message || response.statusText
					}`,
				);
			}

			const data = await response.json();

			if (
				!data.content ||
				!Array.isArray(data.content) ||
				data.content.length === 0
			) {
				throw new Error("Invalid response format from Claude API");
			}

			return data.content[0].text;
		} catch (error) {
			console.error("Claude API Error:", error);
			throw error;
		}
	}

	async measureInputUsage(
		prompt: string,
		options?: PromptOptions,
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

		// Use token counting API - it's free and doesn't consume tokens for generation
		try {
			const headers = {
				"Content-Type": "application/json",
				"x-api-key": this.apiKey,
				"anthropic-version": CLAUDE_API_VERSION,
				"anthropic-dangerous-direct-browser-access": "true",
			};

			const response = await fetch(
				"https://api.anthropic.com/v1/messages/count_tokens",
				{
					method: "POST",
					headers,
					body: JSON.stringify({
						model: CLAUDE_MODEL,
						messages: [{ role: "user", content: "test" }],
					}),
				},
			);

			// API key is valid if we get any response (even errors about content)
			// Token counting doesn't consume generation tokens but validates API access
			return response.status !== 401 && response.status !== 403;
		} catch (error) {
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

	async createSession(systemPrompt?: string): Promise<AISession | null> {
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
