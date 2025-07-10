/**
 * Background service worker specific router
 * Only includes procedures that should be available in the background context
 */

import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import type { AnalysisMemory } from "../types";
import type { AIProviderConfig } from "../utils/ai-interface";
import {
	aiStatusSchema,
	analysisProgressSchema,
	startAnalysisInputSchema,
	startManualAnalysisInputSchema,
} from "./schemas";

// Context available to all procedures
interface Context {
	timestamp: number;
	sender?: chrome.runtime.MessageSender;
}

// Initialize tRPC with SuperJSON transformer
const t = initTRPC.context<Context>().create({
	isServer: false,
	allowOutsideOfServer: true,
	transformer: superjson,
});

// Create subscriptions helper
async function* createSubscription<T>(
	subscribeFn: (callback: (update: T) => void) => () => void,
): AsyncGenerator<T> {
	const queue: T[] = [];
	let resolveNext: (() => void) | null = null;

	const unsubscribe = subscribeFn((update) => {
		queue.push(update);
		if (resolveNext) {
			resolveNext();
			resolveNext = null;
		}
	});

	try {
		while (true) {
			if (queue.length === 0) {
				await new Promise<void>((resolve) => {
					resolveNext = resolve;
				});
			}

			while (queue.length > 0) {
				const update = queue.shift()!;
				yield update;
			}
		}
	} finally {
		unsubscribe();
	}
}

// Background procedures
export const backgroundRouter = t.router({
	// Analysis procedures
	analysis: t.router({
		startManual: t.procedure
			.input(startManualAnalysisInputSchema)
			.mutation(async ({ input }) => {
				const { handleStartManualAnalysis } = await import(
					"../background-handlers"
				);
				return handleStartManualAnalysis(input);
			}),

		cancel: t.procedure
			.input(z.object({ analysisId: z.string() }))
			.mutation(async ({ input }) => {
				const { handleCancelAnalysis } = await import("../background-handlers");
				return handleCancelAnalysis(input);
			}),

		getState: t.procedure.query(async () => {
			const { handleGetAnalysisState } = await import("../background-handlers");
			return handleGetAnalysisState();
		}),

		onProgress: t.procedure.subscription(async function* () {
			const { subscribeToProgress } = await import("../background-handlers");
			yield* createSubscription(subscribeToProgress);
		}),

		onStatus: t.procedure.subscription(async function* () {
			const { subscribeToStatus } = await import("../background-handlers");
			yield* createSubscription(subscribeToStatus);
		}),
	}),

	// Settings
	settings: t.router({
		toggleAutoAnalysis: t.procedure
			.input(z.object({ enabled: z.boolean() }))
			.mutation(async ({ input }) => {
				const { handleToggleAutoAnalysis } = await import(
					"../background-handlers"
				);
				return handleToggleAutoAnalysis(input);
			}),
	}),

	// Ambient analysis
	ambient: t.router({
		queryStatus: t.procedure.query(async () => {
			const { handleQueryStatus } = await import("../background-handlers");
			return handleQueryStatus();
		}),

		queryNextAlarm: t.procedure.query(async () => {
			const { handleQueryNextAlarm } = await import("../background-handlers");
			return handleQueryNextAlarm();
		}),
	}),

	// AI
	ai: t.router({
		initialize: t.procedure.mutation(async () => {
			const { handleInitializeAI } = await import("../background-handlers");
			return handleInitializeAI();
		}),

		getConfig: t.procedure.query(async (): Promise<AIProviderConfig> => {
			const { handleGetAIConfig } = await import("../background-handlers");
			return handleGetAIConfig();
		}),

		onStatus: t.procedure.subscription(async function* () {
			const { subscribeToAIStatus } = await import("../background-handlers");
			yield* createSubscription(subscribeToAIStatus);
		}),
	}),

	// Memory operations
	memory: t.router({
		read: t.procedure.query(async () => {
			const { handleReadMemory } = await import("../background-handlers");
			const result = await handleReadMemory();
			return result.memory;
		}),

		write: t.procedure
			.input(z.object({ memory: z.any() as z.ZodType<AnalysisMemory> }))
			.mutation(async ({ input }) => {
				const { handleWriteMemory } = await import("../background-handlers");
				return handleWriteMemory(input);
			}),

		clearPatterns: t.procedure.mutation(async () => {
			const { handleClearPatterns } = await import("../background-handlers");
			return handleClearPatterns();
		}),
	}),

	// Internal reporting (called by offscreen)
	_internal: t.router({
		reportProgress: t.procedure
			.input(analysisProgressSchema)
			.mutation(async ({ input }) => {
				const { handleProgressReport } = await import("../background-handlers");
				return handleProgressReport(input);
			}),

		reportComplete: t.procedure
			.input(
				z.object({
					analysisId: z.string(),
					result: z.any(), // FullAnalysisResult
				}),
			)
			.mutation(async ({ input }) => {
				const { handleCompleteReport } = await import("../background-handlers");
				return handleCompleteReport(
					input as { analysisId: string; result: unknown },
				);
			}),

		reportError: t.procedure
			.input(
				z.object({
					analysisId: z.string(),
					error: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const { handleErrorReport } = await import("../background-handlers");
				return handleErrorReport(input);
			}),

		reportAIStatus: t.procedure
			.input(aiStatusSchema)
			.mutation(async ({ input }) => {
				const { handleAIStatusReport } = await import("../background-handlers");
				return handleAIStatusReport(input);
			}),

		keepalive: t.procedure.mutation(async () => {
			return { success: true };
		}),
	}),

	// Offscreen procedures (proxied to offscreen document)
	offscreen: t.router({
		startAnalysis: t.procedure
			.input(startAnalysisInputSchema)
			.mutation(async () => {
				// This is handled by forwarding to the offscreen document
				// The actual implementation is in offscreen-handlers
				throw new Error(
					"This procedure should be called on the offscreen document",
				);
			}),

		cancelAnalysis: t.procedure
			.input(z.object({ analysisId: z.string() }))
			.mutation(async () => {
				// This is handled by forwarding to the offscreen document
				throw new Error(
					"This procedure should be called on the offscreen document",
				);
			}),

		initializeAI: t.procedure.mutation(async () => {
			// This is handled by forwarding to the offscreen document
			throw new Error(
				"This procedure should be called on the offscreen document",
			);
		}),
	}),
});

export type BackgroundRouter = typeof backgroundRouter;
