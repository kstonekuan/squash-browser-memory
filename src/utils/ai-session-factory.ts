/**
 * AI Session Factory - Creates AI sessions based on current configuration
 */

import { loadAIConfig } from "./ai-config";
import type { AISession } from "./ai-interface";
import { AIProviderFactory } from "./ai-provider-factory";

/**
 * Create an AI session using the currently configured provider
 */
export async function createAISession(
	systemPrompt?: string,
): Promise<AISession | null> {
	try {
		const config = await loadAIConfig();
		const provider = AIProviderFactory.getProvider(config);

		const session = await provider.createSession(systemPrompt);

		if (!session) {
			console.error(
				`Failed to create session with ${provider.getProviderName()}`,
			);
			return null;
		}

		console.log(`Created AI session using ${provider.getProviderName()}`);
		return session;
	} catch (error) {
		console.error("Failed to create AI session:", error);
		return null;
	}
}

/**
 * Prompt an AI session with error handling and provider-agnostic interface
 */
export async function promptAI(
	session: AISession,
	text: string,
	options?: { responseConstraint?: Record<string, unknown> },
): Promise<string> {
	try {
		return await session.prompt(text, options);
	} catch (error) {
		console.error("AI Prompt Error:", error);
		throw error;
	}
}

/**
 * Check if AI is available with current configuration
 */
export async function isAIAvailable(): Promise<boolean> {
	try {
		const config = await loadAIConfig();
		const provider = AIProviderFactory.getProvider(config);
		return await provider.isAvailable();
	} catch (error) {
		console.error("Failed to check AI availability:", error);
		return false;
	}
}

/**
 * Get the current AI provider status
 */
export async function getAIProviderStatus(): Promise<string> {
	try {
		const config = await loadAIConfig();
		const provider = AIProviderFactory.getProvider(config);
		const status = await provider.getStatus();

		switch (status) {
			case "available":
				return "Available";
			case "needs-configuration":
				return "Needs Configuration";
			case "rate-limited":
				return "Rate Limited";
			case "unavailable":
				return "Unavailable";
			default:
				return "Error";
		}
	} catch (error) {
		console.error("Failed to get AI provider status:", error);
		return "Error";
	}
}
