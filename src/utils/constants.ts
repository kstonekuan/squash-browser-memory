// System prompts
export const DEFAULT_SYSTEM_PROMPT = `You are a helpful assistant that analyzes browsing patterns to identify repetitive workflows and create detailed user profiles. You provide insightful analysis about both workflow optimization opportunities and the user's characteristics, interests, and behavior patterns.

When provided with existing memory/profile data, you MUST intelligently merge it with new findings:
- Deduplicate similar patterns and interests
- Update frequencies and evidence rather than duplicating
- Keep only the most relevant information (10-15 patterns max, 10 interests max)
- Refine the profile based on cumulative understanding, not just append new data`;

export const DEFAULT_CHUNK_SYSTEM_PROMPT = `You are an expert at analyzing temporal patterns in data. You identify natural sessions and activity periods in browsing history based on timestamps. IMPORTANT: Always use the exact millisecond timestamp values provided in the input (13-digit numbers like 1751194854628) when returning startTime and endTime.`;

// Prompt builders
export function buildChunkingPrompt(timestamps: number[]): string {
	return `Group these ${timestamps.length} timestamps into browsing sessions.

Indexed timestamps:
${timestamps
	.map((ts, index) => {
		const d = new Date(ts);
		return `[${index}] ${d.toLocaleDateString()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
	})
	.join("\n")}

Rules:
- Gap >30min = new session
- Sessions can span days if continuous
- Return at least 1 chunk
- Use descriptive labels

IMPORTANT: Return startIndex and endIndex (not startTime/endTime) using the indices shown in brackets above.
Example: If session spans from [5] to [12], return startIndex: 5, endIndex: 12`;
}

import type { UserProfile, WorkflowPattern } from "../types";

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
	memory: {
		userProfile: UserProfile;
		patterns: WorkflowPattern[];
		totalItemsAnalyzed: number;
	},
): string {
	const hasMemory = memory.totalItemsAnalyzed > 0;

	// Send full memory so AI can properly merge and deduplicate
	const memoryForContext = hasMemory ? memory : null;

	const memoryContext = hasMemory
		? `

EXISTING MEMORY (from ${memory.totalItemsAnalyzed} previously analyzed items):
${JSON.stringify(memoryForContext)}

CRITICAL MEMORY UPDATE RULES:
1. CONSOLIDATE patterns:
   - Merge similar patterns (e.g., "Daily GitHub PR review" and "GitHub pull request checking" should become one)
   - Sum frequencies when merging
   - Keep ONLY 10-15 most frequent/important patterns total
   - Remove patterns with frequency < 3 unless highly significant

2. LIMIT lists strictly:
   - interests: MAX 10 items (remove least relevant)
   - workPatterns: MAX 8 items
   - personalityTraits: MAX 8 items  
   - technologyUse: MAX 10 items
   - patterns: MAX 15 items

3. UPDATE don't APPEND:
   - If you see "Software Developer" already in profession, don't add "Developer" 
   - Merge similar interests: "machine learning" + "ML" = just "machine learning"
   - Update existing entries rather than creating duplicates

4. The response must have FEWER or EQUAL items than the input, never more!
`
		: "";

	return `Analyze this chunk of browsing history data and ${hasMemory ? "UPDATE the existing memory" : "create an initial profile"}:

${memoryContext}

NEW DATA CHUNK (${items.length} items):
Time: ${items[0]?.lastVisitTime ? new Date(items[0].lastVisitTime).toLocaleDateString() : "unknown"} to ${items[items.length - 1]?.lastVisitTime ? new Date(items[items.length - 1]?.lastVisitTime || 0).toLocaleDateString() : "unknown"}

Data (d=domain, p=path, q=query params, t=title, ts=timestamp, v=visits):
${JSON.stringify(historyData)}

${
	hasMemory
		? `
Your response should be the UPDATED memory that intelligently merges old and new information:
- Combine similar patterns, updating their frequencies
- Keep profession unless new data strongly suggests a change  
- Update interests list to reflect both old and new (max 10)
- Refine work patterns and technology use
- Update the summary to reflect the complete picture
`
		: "Create an initial profile based on this data."
}`;
}
