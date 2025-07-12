/**
 * Shared validation schemas for tRPC procedures
 * Centralized schema definitions to avoid duplication
 */

import { z } from "zod";

// Base schemas
const memorySettingsSchema = z.object({
	storeWorkflowPatterns: z.boolean(),
});

const historyItemSchema = z.object({
	id: z.string(),
	url: z.string().optional(),
	title: z.string().optional(),
	lastVisitTime: z.number().optional(),
	visitCount: z.number().optional(),
	typedCount: z.number().optional(),
});

const customPromptsSchema = z.object({
	systemPrompt: z.string().optional(),
	chunkPrompt: z.string().optional(),
	mergePrompt: z.string().optional(),
});

// Analysis schemas
export const analysisProgressSchema = z.object({
	analysisId: z.string(),
	timestamp: z.number().optional(), // Unix timestamp in milliseconds
	startTime: z.number().optional(), // Unix timestamp in milliseconds
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
	memorySettings: memorySettingsSchema.optional(),
});

export const startManualAnalysisInputSchema = z.object({
	historyItems: z.array(historyItemSchema),
	customPrompts: customPromptsSchema.optional(),
	memorySettings: memorySettingsSchema.optional(),
});

// Status update schema for broadcasts
export const statusUpdateSchema = z.object({
	status: z.enum(["started", "completed", "error", "skipped"]),
	message: z.string().optional(),
	itemCount: z.number().optional(),
	reason: z.string().optional(),
	error: z.string().optional(),
});

// Helper type exports
export type AnalysisProgress = z.infer<typeof analysisProgressSchema>;
export type StatusUpdate = z.infer<typeof statusUpdateSchema>;
export type AIStatus = z.infer<typeof aiStatusSchema>;
