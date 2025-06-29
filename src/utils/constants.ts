// System prompts
export const DEFAULT_SYSTEM_PROMPT = `You are a helpful assistant that analyzes browsing patterns to identify repetitive workflows and create detailed user profiles. You provide insightful analysis about both workflow optimization opportunities and the user's characteristics, interests, and behavior patterns.`;

export const DEFAULT_CHUNK_SYSTEM_PROMPT = `You are an expert at analyzing temporal patterns in data. You identify natural sessions and activity periods in browsing history based on timestamps.`;

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
): string {
	return `Analyze this browsing history data and create a user profile:

DATA CHUNK (${items.length} items):
Time: ${items[0]?.lastVisitTime ? new Date(items[0].lastVisitTime).toLocaleDateString() : "unknown"} to ${items[items.length - 1]?.lastVisitTime ? new Date(items[items.length - 1]?.lastVisitTime || 0).toLocaleDateString() : "unknown"}

Data (d=domain, p=path, q=query params, t=title, ts=timestamp, v=visits):
${JSON.stringify(historyData)}

Create a profile including:
- Profession based on browsing patterns
- Key interests (up to 10)
- Work patterns (up to 8)
- Personality traits with evidence (up to 8)
- Technology use patterns (up to 10)
- Summary of the user

Also identify workflow patterns:
- Repetitive sequences of sites/actions
- Time patterns (daily, weekly, etc.)
- Automation opportunities
- Include frequency and specific URLs as evidence`;
}

export function buildMergePrompt(
	existingMemory: {
		userProfile: UserProfile;
		patterns: WorkflowPattern[];
		totalItemsAnalyzed: number;
	},
	newResults: {
		userProfile: UserProfile;
		patterns: WorkflowPattern[];
	},
): string {
	return `Merge new analysis results with existing memory:

EXISTING MEMORY (from ${existingMemory.totalItemsAnalyzed} previously analyzed items):
${JSON.stringify(existingMemory)}

NEW ANALYSIS RESULTS:
${JSON.stringify(newResults)}

MERGE RULES:
1. CONSOLIDATE patterns - CRITICAL:
   - DETECT and MERGE similar patterns. Examples:
     * "Daily GitHub PR review" + "Checking GitHub pull requests" = ONE pattern
     * "Google search for programming" + "Search Google for code" = ONE pattern
     * "Reading Reddit programming" + "Browsing r/programming" = ONE pattern
   - When merging, ADD frequencies together
   - Keep ONLY 10-15 most frequent/important patterns total
   - Remove patterns with frequency < 3 unless highly significant
   - NEVER have two patterns that describe the same activity

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

Return the MERGED result that intelligently combines both old and new information.`;
}
