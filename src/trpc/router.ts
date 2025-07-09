/**
 * Unified tRPC router definition for the entire extension
 * This is the single source of truth for all RPC communication
 */

import { initTRPC } from "@trpc/server";
import { z } from "zod";
import type { AnalysisMemory } from "../types";
import type { AIProviderConfig } from "../utils/ai-interface";
import {
	type AnalysisProgress,
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

// Initialize tRPC once
const t = initTRPC.context<Context>().create({
	isServer: false,
	allowOutsideOfServer: true,
});

// Background procedures (implemented by background service worker)
const backgroundProcedures = t.router({
	// Analysis management
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

		// Subscriptions
		onProgress: t.procedure
			.input(z.object({ analysisId: z.string() }))
			.subscription(async function* ({ input }) {
				// TODO: Implement progress subscription
				yield {
					analysisId: input.analysisId,
					phase: "idle" as const,
					chunkProgress: undefined,
					subPhase: undefined,
				} satisfies AnalysisProgress;
			}),

		onStatus: t.procedure.subscription(async function* () {
			const { subscribeToStatus } = await import("../background-handlers");

			const statusQueue: Array<{
				status: "started" | "completed" | "skipped" | "error";
				message?: string;
				itemCount?: number;
				reason?: string;
				error?: string;
			}> = [];

			let resolveNext: (() => void) | null = null;

			const unsubscribe = subscribeToStatus((update) => {
				statusQueue.push(update);
				if (resolveNext) {
					resolveNext();
					resolveNext = null;
				}
			});

			try {
				while (true) {
					if (statusQueue.length === 0) {
						await new Promise<void>((resolve) => {
							resolveNext = resolve;
						});
					}

					while (statusQueue.length > 0) {
						const update = statusQueue.shift()!;
						yield update;
					}
				}
			} finally {
				unsubscribe();
			}
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
			// TODO: Implement AI status subscription
			yield {
				status: "initializing" as "initializing" | "available" | "error",
				error: undefined as string | undefined,
			};
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
});

// Offscreen procedures (implemented by offscreen document)
const offscreenProcedures = t.router({
	startAnalysis: t.procedure
		.input(startAnalysisInputSchema)
		.mutation(async ({ input }) => {
			const { handleStartAnalysis } = await import("../offscreen-handlers");
			return handleStartAnalysis(input);
		}),

	cancelAnalysis: t.procedure
		.input(z.object({ analysisId: z.string() }))
		.mutation(async ({ input }) => {
			const { handleCancelAnalysis } = await import("../offscreen-handlers");
			return handleCancelAnalysis(input);
		}),

	initializeAI: t.procedure.mutation(async () => {
		const { handleInitializeAI } = await import("../offscreen-handlers");
		return handleInitializeAI();
	}),
});

// Unified app router combining all procedures
export const appRouter = t.mergeRouters(
	backgroundProcedures,
	t.router({
		offscreen: offscreenProcedures,
	}),
);

// Types
export type AppRouter = typeof appRouter;
export type BackgroundRouter = typeof backgroundProcedures;
export type OffscreenRouter = typeof offscreenProcedures;

// Export for creating routers in other files if needed
export const createRouter = t.router;
export const publicProcedure = t.procedure;
