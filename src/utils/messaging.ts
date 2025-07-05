/**
 * Centralized messaging definitions for the extension
 * Using @webext-core/messaging for type-safe communication across all contexts
 */

import { defineExtensionMessaging } from "@webext-core/messaging";
import type { AutoAnalysisSettings } from "./ambient";
import type { CustomPrompts } from "./analyzer";

// Progress information for analysis
export interface AnalysisProgress {
	analysisId: string;
	phase:
		| "calculating"
		| "chunking"
		| "analyzing"
		| "retrying"
		| "complete"
		| "error"
		| "idle";
	subPhase?: "sending-analysis" | "sending-merge" | "processing";
	chunkProgress?: {
		current: number;
		total: number;
		description: string;
	};
	retryMessage?: string;
}

// Analysis status for broadcasting
export interface AnalysisStatus {
	status: "started" | "completed" | "error" | "skipped";
	message?: string;
	itemCount?: number;
	reason?: string;
	error?: string;
}

// Define all message types and their payloads/responses
interface ProtocolMap {
	// Manual analysis
	"analysis:start-manual": (data: {
		historyItems: chrome.history.HistoryItem[];
		customPrompts?: CustomPrompts;
	}) => { success: boolean; analysisId?: string; error?: string };

	// Cancel analysis
	"analysis:cancel": (data: { analysisId: string }) => {
		success: boolean;
		error?: string;
	};

	// Run analysis in offscreen document
	"analysis:run-in-offscreen": (data: {
		historyItems: chrome.history.HistoryItem[];
		customPrompts?: CustomPrompts;
		analysisId: string;
	}) => void;

	// Analysis result from offscreen
	"analysis:offscreen-result": (data: {
		success: boolean;
		itemCount?: number;
		analysisId: string;
		error?: string;
		cancelled?: boolean;
	}) => void;

	// Progress updates
	"analysis:progress": (data: AnalysisProgress) => void;

	// Status broadcasts
	"analysis:status": (data: AnalysisStatus) => void;

	// Get current analysis state
	"analysis:get-state": () => {
		isRunning: boolean;
		isManualAnalysisRunning: boolean;
		isAmbientAnalysisRunning: boolean;
		analysisId?: string;
		phase?: string;
		chunkProgress?: AnalysisProgress["chunkProgress"];
		retryMessage?: string;
	};

	// Ambient analysis settings
	"settings:toggle-auto-analysis": (data: { enabled: boolean }) => {
		success: boolean;
		nextRunTime?: number;
		error?: string;
	};

	// Ambient analysis queries
	"ambient:query-status": () => { isRunning: boolean };
	"ambient:query-next-alarm": () => {
		nextRunTime?: number;
		alarmExists: boolean;
	};
	"ambient:analysis-complete": (data: {
		success: boolean;
		itemCount?: number;
		error?: string;
	}) => void;
}

// Export the typed messaging functions
export const { sendMessage, onMessage } =
	defineExtensionMessaging<ProtocolMap>();
