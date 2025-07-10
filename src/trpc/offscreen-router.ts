/**
 * Offscreen document specific router
 * Only includes procedures that should be available in the offscreen context
 */

import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import { startAnalysisInputSchema } from "./schemas";

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
	}),
});

export type OffscreenRouter = typeof offscreenRouter;
