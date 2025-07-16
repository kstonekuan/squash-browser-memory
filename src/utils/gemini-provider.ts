/// <reference types="@types/dom-chromium-ai" />

/**
 * Gemini AI provider implementation using Google GenAI SDK
 */

import {
	type GenerateContentConfig,
	GoogleGenAI,
	type Schema,
	Type,
} from "@google/genai";
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

		try {
			const fullPrompt = this.systemPrompt
				? `${this.systemPrompt}\n\n${text}`
				: text;
			console.log("Request content:", `${fullPrompt.substring(0, 100)}...`);

			// Build config with structured output if needed
			const config: GenerateContentConfig = {
				maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
				thinkingConfig: { thinkingBudget: 2048 },
			};

			if (options?.responseConstraint) {
				config.responseMimeType = "application/json";
				config.responseSchema = this.convertToGeminiSchema(
					options.responseConstraint,
				);
			}

			const response = await this.client.models.generateContent({
				model: GEMINI_MODEL,
				contents: [{ parts: [{ text: fullPrompt }], role: "user" }],
				config,
			});

			console.log("Response received");
			console.log("Response content:", response.text);

			if (!response.text) {
				throw new Error("No text response from Gemini API");
			}

			return response.text;
		} catch (error) {
			console.error("Gemini API Error:", error);

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

	/**
	 * Convert a JSON schema-like responseConstraint to Gemini's Schema format
	 */
	private convertToGeminiSchema(constraint: Record<string, unknown>): Schema {
		// If it's already in Gemini schema format, return as-is
		if (constraint.type && typeof constraint.type === "string") {
			return constraint as Schema;
		}

		// Convert JSON Schema to Gemini Schema
		return this.jsonSchemaToGeminiSchema(constraint);
	}

	/**
	 * Convert JSON Schema to Gemini Schema format
	 */
	private jsonSchemaToGeminiSchema(
		jsonSchema: Record<string, unknown>,
	): Schema {
		const geminiSchema: Schema = {} as Schema;

		// Map JSON Schema type to Gemini Type enum
		if (jsonSchema.type) {
			switch (jsonSchema.type) {
				case "string":
					geminiSchema.type = Type.STRING;
					break;
				case "number":
					geminiSchema.type = Type.NUMBER;
					break;
				case "integer":
					geminiSchema.type = Type.INTEGER;
					break;
				case "boolean":
					geminiSchema.type = Type.BOOLEAN;
					break;
				case "array":
					geminiSchema.type = Type.ARRAY;
					if (jsonSchema.items) {
						geminiSchema.items = this.jsonSchemaToGeminiSchema(
							jsonSchema.items as Record<string, unknown>,
						);
					}
					break;
				case "object":
					geminiSchema.type = Type.OBJECT;
					if (jsonSchema.properties) {
						geminiSchema.properties = {};
						for (const [key, value] of Object.entries(jsonSchema.properties)) {
							geminiSchema.properties[key] = this.jsonSchemaToGeminiSchema(
								value as Record<string, unknown>,
							);
						}
					}
					if (jsonSchema.required && Array.isArray(jsonSchema.required)) {
						geminiSchema.required = jsonSchema.required as string[];
					}
					break;
				case "null":
					geminiSchema.type = Type.NULL;
					break;
			}
		}

		// Copy other relevant properties
		if (jsonSchema.description && typeof jsonSchema.description === "string") {
			geminiSchema.description = jsonSchema.description;
		}
		if (jsonSchema.enum && Array.isArray(jsonSchema.enum)) {
			geminiSchema.enum = jsonSchema.enum as string[];
		}
		if (
			jsonSchema.nullable !== undefined &&
			typeof jsonSchema.nullable === "boolean"
		) {
			geminiSchema.nullable = jsonSchema.nullable;
		}

		// Handle constraints
		if (
			jsonSchema.minLength !== undefined &&
			typeof jsonSchema.minLength === "number"
		) {
			geminiSchema.minLength = String(jsonSchema.minLength);
		}
		if (
			jsonSchema.maxLength !== undefined &&
			typeof jsonSchema.maxLength === "number"
		) {
			geminiSchema.maxLength = String(jsonSchema.maxLength);
		}
		if (
			jsonSchema.minimum !== undefined &&
			typeof jsonSchema.minimum === "number"
		) {
			geminiSchema.minimum = jsonSchema.minimum;
		}
		if (
			jsonSchema.maximum !== undefined &&
			typeof jsonSchema.maximum === "number"
		) {
			geminiSchema.maximum = jsonSchema.maximum;
		}
		if (
			jsonSchema.minItems !== undefined &&
			typeof jsonSchema.minItems === "number"
		) {
			geminiSchema.minItems = String(jsonSchema.minItems);
		}
		if (
			jsonSchema.maxItems !== undefined &&
			typeof jsonSchema.maxItems === "number"
		) {
			geminiSchema.maxItems = String(jsonSchema.maxItems);
		}
		if (
			jsonSchema.minProperties !== undefined &&
			typeof jsonSchema.minProperties === "number"
		) {
			geminiSchema.minProperties = String(jsonSchema.minProperties);
		}
		if (
			jsonSchema.maxProperties !== undefined &&
			typeof jsonSchema.maxProperties === "number"
		) {
			geminiSchema.maxProperties = String(jsonSchema.maxProperties);
		}
		if (jsonSchema.pattern && typeof jsonSchema.pattern === "string") {
			geminiSchema.pattern = jsonSchema.pattern;
		}

		return geminiSchema;
	}

	async measureInputUsage(
		prompt: string,
		_options?: LanguageModelPromptOptions,
	): Promise<number> {
		if (!this.client) {
			throw new Error("Gemini not initialized. Call initialize() first.");
		}

		const fullPrompt = this.systemPrompt
			? `${this.systemPrompt}\n\n${prompt}`
			: prompt;

		try {
			// Note: responseConstraint doesn't count towards input tokens with structured output
			const result = await this.client.models.countTokens({
				model: GEMINI_MODEL,
				contents: [{ parts: [{ text: fullPrompt }], role: "user" }],
			});

			return result.totalTokens || 0;
		} catch (error) {
			console.error("Error counting tokens:", error);
			// Fall back to estimation: ~4 chars per token
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

	getCapabilities(): AIProviderCapabilities {
		return {
			maxInputTokens: 2000000, // Gemini 2.5 Flash supports 2M input tokens
			optimalChunkTokens: 100000, // Optimal chunk size for Gemini 2.5 Flash
			supportsTokenMeasurement: true, // Gemini API provides token counting via countTokens()
		};
	}
}
