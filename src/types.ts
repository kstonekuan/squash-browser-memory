import type { z } from "zod/v4";
import type { AnalysisResultSchema } from "./utils/schemas";

// Core analysis result type derived from Zod schema (just patterns and userProfile)
export type MemoryData = z.infer<typeof AnalysisResultSchema>;

// Individual types for convenience
export type WorkflowPattern = MemoryData["patterns"][number];
export type UserProfile = MemoryData["userProfile"];
export interface HistoryStats {
	totalUrls: number;
	topDomains: { domain: string; count: number }[];
	dateRange: { start: Date; end: Date };
}
export interface ChunkInfo {
	startTime: Date;
	endTime: Date;
	itemCount: number;
	isFallback?: boolean;
}

// Time range for a chunk
export interface ChunkTimeRange {
	startTime: number; // timestamp
	endTime: number; // timestamp
}

export interface ChunkingResult {
	timeRanges: ChunkTimeRange[];
	rawResponse?: string;
	error?: string;
	isFallback: boolean;
}

// Custom prompts for AI analysis
export interface CustomPrompts {
	userProfilePrompt?: string;
	workflowPatternsPrompt?: string;
	chunkPrompt?: string;
	mergePrompt?: string;
}

// Memory management settings
export interface MemorySettings {
	storeWorkflowPatterns: boolean;
}

// Memory structure for accumulated analysis
export interface AnalysisMemory {
	userProfile: UserProfile;
	patterns: WorkflowPattern[];
	lastAnalyzedDate: Date;
	lastHistoryTimestamp: number;
	version: string;
}

export interface FullAnalysisResult {
	stats: HistoryStats;
	chunks: ChunkInfo[];
	chunkingResult: ChunkingResult;
	memory: AnalysisMemory;
}
