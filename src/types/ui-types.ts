/**
 * Shared UI type definitions to avoid duplication across components
 */

import type { StatusUpdate } from "../trpc/schemas";
import type { AIProviderStatus } from "../utils/ai-interface";

/**
 * Analysis status for the UI components
 * Extends StatusUpdate to include "idle" state for UI
 */
export type AnalysisStatus = Omit<StatusUpdate, "status"> & {
	status: "idle" | "running" | "completed" | "skipped" | "error";
};

/**
 * Re-export AIProviderStatus for convenience
 * This prevents components from importing from utils/ai-interface
 */
export type { AIProviderStatus };
