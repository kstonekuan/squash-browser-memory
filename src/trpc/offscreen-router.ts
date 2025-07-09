/**
 * Offscreen document router
 * Handles procedures that the offscreen document implements
 */

import { initTRPC } from "@trpc/server";
import { z } from "zod";
import { startAnalysisInputSchema } from "./schemas";

// Context available to procedures
interface Context {
	timestamp: number;
	sender?: chrome.runtime.MessageSender;
}

const t = initTRPC.context<Context>().create({
	isServer: false,
	allowOutsideOfServer: true,
});

// Offscreen procedures (implemented by offscreen document)
export const offscreenRouter = t.router({
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
