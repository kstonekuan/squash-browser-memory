/**
 * Offscreen document specific router
 * Only includes procedures that should be available in the offscreen context
 */

import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import {
	handleCancelAnalysis,
	handleInitializeAI,
	handleStartAnalysis,
} from "../offscreen-handlers";
import { startAnalysisInputSchema, type TRPCContext } from "./schemas";

// Initialize tRPC with SuperJSON transformer
const t = initTRPC.context<TRPCContext>().create({
	isServer: false,
	allowOutsideOfServer: true,
	transformer: superjson,
});

// Offscreen procedures
export const offscreenRouter = t.router({
	offscreen: t.router({
		startAnalysis: t.procedure
			.input(startAnalysisInputSchema)
			.mutation(async ({ input, ctx }) => {
				return handleStartAnalysis(input, ctx);
			}),

		cancelAnalysis: t.procedure
			.input(z.object({ analysisId: z.string() }))
			.mutation(async ({ input, ctx }) => {
				return handleCancelAnalysis(input, ctx);
			}),

		initializeAI: t.procedure.mutation(async ({ ctx }) => {
			return handleInitializeAI(ctx);
		}),
	}),
});

export type OffscreenRouter = typeof offscreenRouter;
