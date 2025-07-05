// System prompts
export const CHUNK_SYSTEM_PROMPT = `You are an expert at analyzing temporal patterns in data. You identify natural sessions and activity periods in browsing history based on timestamps.`;

export const ANALYSIS_SYSTEM_PROMPT = `Analyze browsing patterns to build detailed user profiles with evidence-based analysis.
Rules:
- Use different evidence thresholds: stable traits require 2+ distinct signals, dynamic context updates frequently
- Be specific and use actual evidence from browsing history
- Return empty arrays/strings rather than guess or make assumptions`;

export const MERGE_SYSTEM_PROMPT = `Merge browsing analysis results using evidence-based evolution.

Merge rules:
- Stable traits (coreIdentities, personalPreferences): Require 2+ distinct signals to modify, evolve slowly with strong evidence
- Dynamic context (currentTasks, currentInterests): Update frequently, prioritize recent evidence over older patterns
- Evolution examples:
  - Identities: UX Designer → Senior UX Designer (role progression)
  - Tasks: Find work → Land 6-month retainer (goal refinement)
  - Interests: General design tools → Figma variables beta (specificity)
- Consolidate similar patterns, sum frequencies, remove completed/outdated items
- Most specific and recent evidence wins
- Maintain narrative coherence in the summary`;

import { format } from "date-fns";
import type { MemoryData } from "../types";

// Prompt builders
export function buildChunkingPrompt(timestamps: number[]): string {
	return `Group these ${timestamps.length} timestamps into browsing sessions.

Indexed timestamps:
${timestamps
	.map((ts, index) => {
		return `[${index}] ${format(new Date(ts), "PP HH:mm")}`;
	})
	.join("\n")}`;
}

export function buildAnalysisPrompt(
	items: chrome.history.HistoryItem[],
	historyData: Array<{
		d: string;
		p: string;
		q?: Record<string, string>;
		t: string;
		ts: number;
		v: number;
	}>,
): string {
	const firstItem = items[0];
	const lastItem = items[items.length - 1];

	const startTime = firstItem?.lastVisitTime
		? format(new Date(firstItem.lastVisitTime), "PP")
		: "unknown";
	const endTime = lastItem?.lastVisitTime
		? format(new Date(lastItem.lastVisitTime), "PP")
		: "unknown";

	return `
HISTORY (${items.length} items):
Time: ${startTime} to ${endTime}

Data (d=domain, p=path, q=query params, t=title, ts=timestamp, v=visits):
${JSON.stringify(historyData)}`;
}

export function buildMergePrompt(
	existingMemory: MemoryData,
	newResults: MemoryData,
): string {
	return `EXISTING MEMORY:
${JSON.stringify(existingMemory)}

NEW MEMORY:
${JSON.stringify(newResults)}`;
}
