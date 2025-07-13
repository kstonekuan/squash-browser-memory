/**
 * Broadcast utilities for sending tRPC-formatted messages from background to sidepanel
 * These are one-way notifications that don't expect responses
 */

import type { AIStatus, AnalysisProgress, StatusUpdate } from "../trpc/schemas";

// Type for tRPC broadcast messages
interface TRPCBroadcastMessage<T = unknown> {
	type: "trpc";
	target: string;
	path: string;
	input: T;
}

/**
 * Generic helper to broadcast messages to the sidepanel
 * @param path - The tRPC path/procedure name
 * @param input - The message payload
 * @param logMessage - Message to log for debugging
 */
async function broadcastToSidepanel<T>(
	path: string,
	input: T,
	logMessage: string,
): Promise<void> {
	try {
		const message: TRPCBroadcastMessage<T> = {
			type: "trpc",
			target: "sidepanel",
			path,
			input,
		};
		await chrome.runtime.sendMessage(message);
	} catch {
		// No listeners or sidepanel not open - this is expected
		// when the sidepanel is closed, so we silently ignore
	}
	console.log(`[Broadcast] ${logMessage}`, input);
}

/**
 * Typed broadcast functions for specific message types
 * These correspond to the procedures defined in sidepanel-router.ts
 */
export const broadcast = {
	/**
	 * Broadcast analysis status updates (running, completed, error, skipped)
	 */
	analysisStatus: (update: StatusUpdate) =>
		broadcastToSidepanel(
			"statusUpdate",
			update,
			`Analysis status: ${update.status}`,
		),

	/**
	 * Broadcast analysis progress updates during processing
	 */
	analysisProgress: (progress: AnalysisProgress) =>
		broadcastToSidepanel(
			"progressUpdate",
			progress,
			`Progress: ${progress.analysisId} - ${progress.phase}`,
		),

	/**
	 * Broadcast AI provider status updates
	 */
	aiStatus: (status: AIStatus) =>
		broadcastToSidepanel(
			"aiStatusUpdate",
			status,
			`AI status: ${status.status}${status.error ? ` - ${status.error}` : ""}`,
		),
};
