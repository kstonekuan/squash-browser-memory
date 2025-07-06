import type { z } from "zod/v4";
import type { AnalysisResultSchema } from "./utils/schemas";

// Core analysis result type derived from Zod schema (just patterns and userProfile)
export type MemoryData = z.infer<typeof AnalysisResultSchema>;

// Individual types for convenience
export type WorkflowPattern = MemoryData["patterns"][number];
export type UserProfile = MemoryData["userProfile"];

export interface ChunkInfo {
	startTime: Date;
	endTime: Date;
	itemCount: number;
	description: string;
	isFallback?: boolean;
}

interface AnalysisResult {
	totalUrls: number;
	dateRange: {
		start: Date;
		end: Date;
	};
	patterns: WorkflowPattern[];
	topDomains: { domain: string; count: number }[];
	userProfile: UserProfile;
}

export interface FullAnalysisResult {
	analysis: AnalysisResult;
	diagnostics: {
		chunks: ChunkInfo[];
		chunkingRawResponse?: string;
		chunkingError?: string;
	};
}
