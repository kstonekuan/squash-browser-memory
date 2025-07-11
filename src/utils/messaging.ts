/**
 * Centralized messaging definitions for the extension
 * Using @webext-core/messaging for type-safe communication across all contexts
 */

import { defineExtensionMessaging } from "@webext-core/messaging";
import type {
	AnalysisMemory,
	FullAnalysisResult,
	MemorySettings,
} from "../types";
import type { AIProviderConfig } from "./ai-interface";
import type { CustomPrompts } from "./analyzer";

// Progress information for analysis
export interface AnalysisProgress {
	analysisId: string;
	phase:
		| "calculating"
		| "chunking"
		| "analyzing"
		| "complete"
		| "error"
		| "idle";
	subPhase?: "sending-analysis" | "sending-merge" | "processing";
	chunkProgress?: {
		current: number;
		total: number;
		description: string;
	};
}

// Analysis status for broadcasting
interface AnalysisStatus {
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
		subPhase?: AnalysisProgress["subPhase"];
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

	// Offscreen document messages
	"offscreen:start-analysis": (data: {
		historyItems: chrome.history.HistoryItem[];
		customPrompts?: CustomPrompts;
		analysisId: string;
		trigger: "manual" | "alarm";
		memorySettings?: MemorySettings;
	}) => void;

	"offscreen:cancel": (data: { analysisId: string }) => {
		success: boolean;
		error?: string;
	};

	"offscreen:progress": (data: AnalysisProgress) => void;

	"offscreen:analysis-complete": (data: {
		analysisId: string;
		result: FullAnalysisResult;
	}) => void;

	"offscreen:analysis-error": (data: {
		analysisId: string;
		error: string;
	}) => void;

	"offscreen:read-memory": () => {
		memory: AnalysisMemory | null;
	};

	"offscreen:write-memory": (data: { memory: AnalysisMemory }) => {
		success: boolean;
	};

	"memory:clear-patterns": () => {
		success: boolean;
		error?: string;
	};

	"offscreen:keepalive": () => {
		success: boolean;
	};

	// AI config management
	"offscreen:get-ai-config": () => AIProviderConfig;

	// AI initialization (from sidepanel to background)
	"ai:initialize": () => void;

	// AI initialization (from background to offscreen)
	"offscreen:initialize-ai": () => void;

	// AI status updates (from offscreen to background to sidepanel)
	"offscreen:ai-status": (data: {
		status: "initializing" | "available" | "error";
		error?: string;
	}) => void;
}

// Export the typed messaging functions
export const { sendMessage, onMessage } =
	defineExtensionMessaging<ProtocolMap>();
