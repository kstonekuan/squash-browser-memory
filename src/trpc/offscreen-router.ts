/**
 * Offscreen document specific router
 * Only includes procedures that should be available in the offscreen context
 */

import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import {
	handleApiKeyChange,
	handleCancelAnalysis,
	handleCheckAllProvidersStatus,
	handleInitializeAI,
	handleStartAnalysis,
} from "../offscreen-handlers";
import {
	providerStatusResultSchema,
	startAnalysisInputSchema,
} from "./schemas";

// Context available to all procedures
interface Context {
	timestamp: number;
}

// Initialize tRPC with SuperJSON transformer
const t = initTRPC.context<Context>().create({
	isServer: false,
	allowOutsideOfServer: true,
	transformer: superjson,
});

// Offscreen procedures
export const offscreenRouter = t.router({
	offscreen: t.router({
		startAnalysis: t.procedure
			.input(startAnalysisInputSchema)
			.mutation(async ({ input }) => {
				return handleStartAnalysis(input);
			}),

		cancelAnalysis: t.procedure
			.input(z.object({ analysisId: z.string() }))
			.mutation(async ({ input }) => {
				return handleCancelAnalysis(input);
			}),

		initializeAI: t.procedure.mutation(async () => {
			return handleInitializeAI();
		}),

		checkAllProvidersStatus: t.procedure
			.output(providerStatusResultSchema)
			.query(async () => {
				return handleCheckAllProvidersStatus();
			}),

		clearProviderCache: t.procedure
			.input(z.object({ provider: z.enum(["chrome", "claude", "gemini"]) }))
			.mutation(async ({ input }) => {
				return handleApiKeyChange(input.provider);
			}),
	}),
});

export type OffscreenRouter = typeof offscreenRouter;
