/**
 * Shared UI type definitions to avoid duplication across components
 */

import type { AIProviderStatus } from "../utils/ai-interface";

/**
 * Analysis status for the UI components
 * Used in AmbientAnalysisCard and App components
 */
export type AnalysisStatus = {
	status: "idle" | "running" | "completed" | "skipped" | "error";
	message?: string;
	itemCount?: number;
	reason?: string;
};

/**
 * Re-export AIProviderStatus for convenience
 * This prevents components from importing from utils/ai-interface
 */
export type { AIProviderStatus };
