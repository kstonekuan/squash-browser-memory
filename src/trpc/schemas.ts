/**
 * Shared validation schemas for tRPC procedures
 * Centralized schema definitions to avoid duplication
 */

import { z } from "zod";

// Base schemas
export const historyItemSchema = z.object({
	id: z.string(),
	url: z.string().optional(),
	title: z.string().optional(),
	lastVisitTime: z.number().optional(),
	visitCount: z.number().optional(),
	typedCount: z.number().optional(),
});

export const customPromptsSchema = z.object({
	systemPrompt: z.string().optional(),
	chunkPrompt: z.string().optional(),
	mergePrompt: z.string().optional(),
});

// Analysis schemas
export const analysisProgressSchema = z.object({
	analysisId: z.string(),
	phase: z.enum([
		"calculating",
		"chunking",
		"analyzing",
		"complete",
		"error",
		"idle",
	]),
	subPhase: z
		.enum(["sending-analysis", "sending-merge", "processing"])
		.optional(),
	chunkProgress: z
		.object({
			current: z.number(),
			total: z.number(),
			description: z.string(),
		})
		.optional(),
});

export const analysisStatusSchema = z.object({
	status: z.enum(["started", "completed", "error", "skipped"]),
	message: z.string().optional(),
	itemCount: z.number().optional(),
	reason: z.string().optional(),
	error: z.string().optional(),
});

// AI schemas
export const aiStatusSchema = z.object({
	status: z.enum(["initializing", "available", "error"]),
	error: z.string().optional(),
});

// Analysis input schemas
export const startAnalysisInputSchema = z.object({
	historyItems: z.array(historyItemSchema),
	customPrompts: customPromptsSchema.optional(),
	analysisId: z.string(),
	trigger: z.enum(["manual", "alarm"]),
});

export const startManualAnalysisInputSchema = z.object({
	historyItems: z.array(historyItemSchema),
	customPrompts: customPromptsSchema.optional(),
});

// Helper type exports
export type HistoryItem = z.infer<typeof historyItemSchema>;
export type CustomPrompts = z.infer<typeof customPromptsSchema>;
export type AnalysisProgress = z.infer<typeof analysisProgressSchema>;
export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;
export type AIStatus = z.infer<typeof aiStatusSchema>;
