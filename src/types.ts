import type { z } from "zod/v4";
import type { AnalysisResultSchema } from "./utils/schemas";

// Derive types from Zod schemas
export type WorkflowPattern = z.infer<
	typeof AnalysisResultSchema
>["patterns"][number];
export type UserProfile = z.infer<typeof AnalysisResultSchema>["userProfile"];

export interface ChunkInfo {
	startTime: Date;
	endTime: Date;
	itemCount: number;
	description: string;
	isFallback?: boolean;
}

export interface AnalysisResult {
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
