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
			// Build the prompt with length constraints if using structured output
			let fullPrompt = this.systemPrompt
				? `${this.systemPrompt}\n\n${text}`
				: text;

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

				// Add explicit length constraints to the prompt for Gemini
				const lengthConstraints = this.extractLengthConstraints(
					config.responseSchema as Schema,
				);
				if (lengthConstraints.length > 0) {
					fullPrompt +=
						"\n\nIMPORTANT LENGTH CONSTRAINTS:\n" +
						lengthConstraints.join("\n");
				}

				// Debug: Log the converted schema
				console.log(
					"Gemini responseSchema:",
					JSON.stringify(config.responseSchema, null, 2),
				);
			}

			console.log("Request content:", `${fullPrompt.substring(0, 100)}...`);

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

			// Post-process response to enforce length constraints if using structured output
			if (options?.responseConstraint && config.responseSchema) {
				try {
					const parsed = JSON.parse(response.text);
					const processed = this.enforceStringLengths(
						parsed,
						config.responseSchema as Schema,
					);
					return JSON.stringify(processed);
				} catch (e) {
					// If parsing fails, return as-is
					console.warn(
						"Failed to post-process response for length constraints:",
						e,
					);
				}
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
		// If it's already in Gemini schema format (has Type enum values), return as-is
		if (
			constraint.type &&
			Object.values(Type).includes(constraint.type as Type)
		) {
			return constraint as Schema;
		}

		// Otherwise, it's likely a JSON Schema from Zod's toJSONSchema
		return this.zodJsonSchemaToGeminiSchema(constraint);
	}

	/**
	 * Convert Zod-generated JSON Schema to Gemini Schema format
	 * Handles the specific JSON Schema format that Zod v4's toJSONSchema produces
	 */
	private zodJsonSchemaToGeminiSchema(
		jsonSchema: Record<string, unknown>,
	): Schema {
		const geminiSchema: Schema = {} as Schema;

		// Handle $schema and other metadata fields that Zod might add
		const schemaType = jsonSchema.type || jsonSchema.$type;

		// Map JSON Schema type to Gemini Type enum
		if (schemaType) {
			switch (schemaType) {
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
				case "null":
					geminiSchema.type = Type.NULL;
					break;
				case "array":
					geminiSchema.type = Type.ARRAY;
					if (jsonSchema.items) {
						geminiSchema.items = this.zodJsonSchemaToGeminiSchema(
							jsonSchema.items as Record<string, unknown>,
						);
					}
					break;
				case "object":
					geminiSchema.type = Type.OBJECT;
					if (jsonSchema.properties) {
						geminiSchema.properties = {};
						for (const [key, value] of Object.entries(jsonSchema.properties)) {
							geminiSchema.properties[key] = this.zodJsonSchemaToGeminiSchema(
								value as Record<string, unknown>,
							);
						}
					}
					if (jsonSchema.required && Array.isArray(jsonSchema.required)) {
						geminiSchema.required = jsonSchema.required as string[];
					}
					break;
			}
		}

		// Handle anyOf/oneOf (common in Zod schemas for optionals and unions)
		if (jsonSchema.anyOf && Array.isArray(jsonSchema.anyOf)) {
			// For simple optional fields (e.g., [{type: "string"}, {type: "null"}])
			const types = jsonSchema.anyOf.map(
				(s: unknown) => (s as Record<string, unknown>).type,
			);
			if (types.length === 2 && types.includes("null")) {
				const nonNullType = types.find((t: unknown) => t !== "null");
				if (nonNullType) {
					// Recursively convert the non-null schema
					const nonNullSchema = jsonSchema.anyOf.find(
						(s: unknown) => (s as Record<string, unknown>).type === nonNullType,
					);
					const converted = this.zodJsonSchemaToGeminiSchema(
						nonNullSchema as Record<string, unknown>,
					);
					converted.nullable = true;
					return converted;
				}
			}
		}

		// Copy description (Zod's .describe() maps to this)
		if (jsonSchema.description && typeof jsonSchema.description === "string") {
			geminiSchema.description = jsonSchema.description;
		}

		// Handle enum values
		if (jsonSchema.enum && Array.isArray(jsonSchema.enum)) {
			geminiSchema.enum = jsonSchema.enum as string[];
		}

		// Handle string constraints
		if (jsonSchema.minLength !== undefined) {
			geminiSchema.minLength = String(jsonSchema.minLength);
		}
		if (jsonSchema.maxLength !== undefined) {
			geminiSchema.maxLength = String(jsonSchema.maxLength);
		}
		if (jsonSchema.pattern) {
			geminiSchema.pattern = String(jsonSchema.pattern);
		}

		// Handle number constraints
		if (jsonSchema.minimum !== undefined) {
			geminiSchema.minimum = Number(jsonSchema.minimum);
		}
		if (jsonSchema.maximum !== undefined) {
			geminiSchema.maximum = Number(jsonSchema.maximum);
		}

		// Handle array constraints
		if (jsonSchema.minItems !== undefined) {
			geminiSchema.minItems = String(jsonSchema.minItems);
		}
		if (jsonSchema.maxItems !== undefined) {
			geminiSchema.maxItems = String(jsonSchema.maxItems);
		}

		// Handle object constraints
		if (jsonSchema.minProperties !== undefined) {
			geminiSchema.minProperties = String(jsonSchema.minProperties);
		}
		if (jsonSchema.maxProperties !== undefined) {
			geminiSchema.maxProperties = String(jsonSchema.maxProperties);
		}

		// Handle additionalProperties (Zod strict mode)
		if (jsonSchema.additionalProperties === false) {
			// Gemini doesn't have a direct equivalent, but we can note it in the description
			if (geminiSchema.description) {
				geminiSchema.description +=
					" (strict: no additional properties allowed)";
			}
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

	/**
	 * Extract length constraints from a Gemini schema to add to the prompt
	 */
	private extractLengthConstraints(
		schema: Schema,
		path: string = "",
	): string[] {
		const constraints: string[] = [];

		if (schema.type === Type.STRING && schema.maxLength) {
			const fieldPath = path || "root";
			constraints.push(
				`- ${fieldPath}: maximum ${schema.maxLength} characters`,
			);
		}

		if (schema.type === Type.OBJECT && schema.properties) {
			for (const [key, value] of Object.entries(schema.properties)) {
				const subPath = path ? `${path}.${key}` : key;
				constraints.push(...this.extractLengthConstraints(value, subPath));
			}
		}

		if (schema.type === Type.ARRAY && schema.items) {
			const subPath = path ? `${path}[]` : "array items";
			constraints.push(...this.extractLengthConstraints(schema.items, subPath));
		}

		return constraints;
	}

	/**
	 * Post-process response to enforce string length constraints
	 */
	private enforceStringLengths(data: any, schema: Schema): any {
		if (
			schema.type === Type.STRING &&
			schema.maxLength &&
			typeof data === "string"
		) {
			const maxLen = parseInt(schema.maxLength, 10);
			if (data.length > maxLen) {
				console.warn(
					`Truncating string from ${data.length} to ${maxLen} characters`,
				);
				return data.substring(0, maxLen);
			}
		}

		if (
			schema.type === Type.OBJECT &&
			schema.properties &&
			typeof data === "object" &&
			data !== null
		) {
			const processed: any = {};
			for (const [key, value] of Object.entries(data)) {
				if (schema.properties[key]) {
					processed[key] = this.enforceStringLengths(
						value,
						schema.properties[key],
					);
				} else {
					processed[key] = value;
				}
			}
			return processed;
		}

		if (schema.type === Type.ARRAY && schema.items && Array.isArray(data)) {
			return data.map((item) => this.enforceStringLengths(item, schema.items!));
		}

		return data;
	}
}
