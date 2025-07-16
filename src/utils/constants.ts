import { format } from "date-fns";
import type { MemoryData } from "../types";

// Analysis configuration
export const MIN_HISTORY_ITEMS_FOR_ANALYSIS = 2; // Minimum number of history items required for meaningful analysis

// System prompts
export const CHUNK_SYSTEM_PROMPT = `You are an expert data analyst. Your task is to group a list of timestamps into distinct browsing sessions.`;

export const USER_PROFILE_SYSTEM_PROMPT = `You are a user behavior analyst. Your goal is to create a rich, evidence-based user profile from the provided browsing history.
**Rules:**
1.  **Evidence is Key:** Base all inferences directly on the provided URLs and titles.
2.  **Differentiate Traits:**
    *   **Stable Traits** (identities, preferences) require strong, repeated evidence (at least 2-3 distinct signals).
    *   **Dynamic Context** (tasks, interests) should reflect recent or ongoing activities.
3.  **No Guessing:** If evidence is insufficient, use empty arrays or strings. Never invent information.`;

export const MERGE_SYSTEM_PROMPT = `You are an intelligent data synthesizer. Your task is to merge an EXISTING profile with a NEW one into a single, coherent, and updated profile.
**Guiding Principle:** Evolve the profile based on new evidence, prioritizing recency and specificity.
**Merge Rules:**
1.  **Evolve Stable Traits:** Modify \`coreIdentities\` and \`personalPreferences\` only with strong evidence.
    *   *Example:* 'UX Designer' → 'Senior UX Designer' (role progression).
2.  **Update Dynamic Context:** Refresh \`currentTasks\` and \`currentInterests\` with the latest activity. Remove completed or outdated items.
    *   *Example:* 'Find work' → 'Land 6-month retainer' (goal refinement).
3.  **Consolidate & De-duplicate:** Combine similar entries and remove redundancies.
4.  **Resolve Conflicts:** The most specific and recent evidence wins.
    *   *Example:* 'General design tools' is superseded by 'Figma variables beta'.
5.  **Update Summary:** Rewrite the summary to reflect the newly merged profile.`;

export const WORKFLOW_PATTERNS_SYSTEM_PROMPT = `You are a productivity analyst. Your objective is to identify recurring, multi-step workflow patterns from browsing history.
**For each distinct pattern you find, you must:**
1.  **Identify the Workflow:** Describe a recurring sequence of actions or a group of related sites (e.g., 'Morning news check', 'Pre-meeting research').
2.  **Group URLs:** List the key URLs that are part of this workflow.
3.  **Suggest an Action:** Provide a concrete, actionable suggestion for optimization or automation.
4.  **Rate Potential:** Classify the automation potential as 'high', 'medium', or 'low'.
**Constraint:** Base all findings strictly on the provided browsing data. Do not speculate`;

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
	includePatterns: boolean = true,
): string {
	// Create copies of the data to avoid mutating the original
	const existingData = { ...existingMemory };
	const newData = { ...newResults };

	// Remove patterns if not including them
	if (!includePatterns) {
		existingData.patterns = [];
		newData.patterns = [];
	}

	return `EXISTING MEMORY:
${JSON.stringify(existingData)}

NEW MEMORY:
${JSON.stringify(newData)}`;
}
