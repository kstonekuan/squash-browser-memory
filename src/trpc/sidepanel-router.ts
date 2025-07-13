/**
 * Sidepanel Router for receiving broadcast messages from the background script
 * This router runs in the sidepanel context and handles incoming updates
 */

import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import {
	type AIStatus,
	type AnalysisProgress,
	aiStatusSchema,
	analysisProgressSchema,
	type StatusUpdate,
	statusUpdateSchema,
} from "./schemas";

// Context for sidepanel procedures
interface SidepanelContext {
	timestamp?: number;
}

// Initialize tRPC with SuperJSON transformer
const t = initTRPC.context<SidepanelContext>().create({
	isServer: false,
	allowOutsideOfServer: true,
	transformer: superjson,
});

// Define the procedures that the sidepanel can receive
export const createSidepanelRouter = (handlers: {
	onStatusUpdate: (input: StatusUpdate) => void;
	onProgressUpdate: (input: AnalysisProgress) => void;
	onAIStatusUpdate: (input: AIStatus) => void;
}) => {
	return t.router({
		statusUpdate: t.procedure
			.input(statusUpdateSchema)
			.mutation(({ input }) => {
				handlers.onStatusUpdate(input);
				return { received: true };
			}),

		progressUpdate: t.procedure
			.input(analysisProgressSchema)
			.mutation(({ input }) => {
				handlers.onProgressUpdate(input);
				return { received: true };
			}),

		aiStatusUpdate: t.procedure.input(aiStatusSchema).mutation(({ input }) => {
			handlers.onAIStatusUpdate(input);
			return { received: true };
		}),
	});
};
