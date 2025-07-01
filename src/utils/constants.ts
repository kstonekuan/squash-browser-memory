// System prompts
export const CHUNK_SYSTEM_PROMPT = `You are an expert at analyzing temporal patterns in data. You identify natural sessions and activity periods in browsing history based on timestamps.

When grouping timestamps into browsing sessions:

Rules:
- Gap >30min = new session
- Sessions can span days if continuous
- Return at least 1 chunk
- Use descriptive labels

IMPORTANT: Return startIndex and endIndex (not startTime/endTime) using the indices shown in brackets in the data.
Example: If session spans from [5] to [12], return startIndex: 5, endIndex: 12

IMPORTANT: Return only valid JSON matching the schema. Do not include markdown formatting, code blocks, or any other text.`;

export const ANALYSIS_SYSTEM_PROMPT = `You are a helpful assistant that analyzes browsing patterns to create detailed user profiles with specific, rich insights.

When analyzing browsing history data, create profiles with these specific fields:

**CORE IDENTITIES** (up to 5, roles and professional identity):
Examples: "Senior UX Designer", "Frontend Engineer", "Digital Marketing Manager", "Freelance Consultant", "Remote Worker"

**PERSONAL PREFERENCES** (up to 8, specific choices):
Examples: {category: "Style", preference: "Minimalist capsule wardrobe"}, {category: "Travel", preference: "prefers night trains over flights"}, {category: "Diet", preference: "vegetarian"}, {category: "UI", preference: "always dark-theme"}, {category: "Music", preference: "loves techno at 124 BPM"}

**CURRENT TASKS** (up to 10, actionable goals and projects):
Examples: "Land a 6-month remote retainer", "redesign onboarding flow for mental-health app", "reach B2 level Portuguese", "cycle Camino de Santiago", "publish UX case-study on Medium", "build Notion template shop"

**CURRENT INTERESTS** (up to 8, current focus areas and obsessions):
Examples: "Figma micro-interactions", "zero-waste travel", "EU Digital Services Act", "water-color journaling", "Figma variables beta", "Interrail Global Pass pricing", "dark patterns podcast", "Lisbon vs Porto coworking reviews"

**SUMMARY** (one engaging sentence):
Example: "Remote UX designer living the nomad life—sketching SaaS dashboards by day, scouting Lisbon surf hostels by night, and hunting for the perfect dark-mode micro-interaction."

Also identify workflow patterns:
- Repetitive sequences of sites/actions
- Time patterns (daily, weekly, etc.)
- Automation opportunities
- Include frequency and specific URLs as evidence

CRITICAL: Be specific, not generic. Use evidence from the browsing data to create vivid, detailed insights about this person's life, work, and interests.

IMPORTANT: Return only valid JSON matching the schema. Do not include markdown formatting, code blocks, or any other text.`;

export const MERGE_SYSTEM_PROMPT = `You are a helpful assistant that intelligently merges browsing analysis results to create richer, more accurate user profiles.

INTELLIGENT MERGE RULES - Treat fields differently based on stability:

**=== STABLE BACKGROUND - RESISTANT TO CHANGE ===**
Require strong evidence to modify. Evolve slowly and carefully.

1. **CORE IDENTITIES** - High evidence threshold:
   Examples: "UX Designer" → "Senior UX Designer" → "Freelance UX Designer"
   Only update with substantial new evidence of role change
   Keep identities separate and distinct

2. **PERSONAL PREFERENCES** - Consolidate similar, preserve core values:
   Examples:
   - Style: "Minimalist" + "Capsule wardrobe" → "Minimalist capsule wardrobe"
   - Travel: "Train travel" + "Environmental" → "prefers night trains over flights"
   - UI: "Dark mode" + "Always" → "always dark-theme"
   Deep preferences rarely change completely

**=== CURRENT CONTEXT - EMBRACE CHANGE ===**
Update frequently. Replace outdated with recent. Show progression.

3. **CURRENT TASKS** - Replace completed, update in progress:
   Examples:
   - "Find freelance work" → "Land a 6-month remote retainer" (more specific)
   - "Learn Portuguese" → "reach B2 level Portuguese" (progression)
   - Remove completed tasks, keep active/evolving ones

4. **CURRENT INTERESTS** - Fresh interests replace older ones:
   Examples:
   - Keep "Figma variables beta" over "General design tools"
   - Prioritize specific current focus over broad interests
   - Replace with most recent intense interests and obsessions

5. **SUMMARY NARRATIVE** - Always refresh to reflect current state:
    Combine: identities + current tasks + interests + preferences
    Example: "Senior UX designer living the nomad life—sketching SaaS dashboards by day, scouting Lisbon surf hostels by night, and hunting for the perfect dark-mode micro-interaction."
    Should capture current moment in person's life and work

6. **WORKFLOW PATTERNS** - CONSOLIDATE similar activities:
    Examples:
    - "Daily GitHub PR review" + "Checking GitHub pull requests" = "Daily GitHub PR review and triage" (frequency: sum both)
    - "Google programming search" + "Stack Overflow research" = "Technical problem research workflow"

**CRITICAL MERGE PRINCIPLES:**
- EVOLVE entries with new evidence (don't just add)
- Keep MOST SPECIFIC and RECENT information
- REMOVE outdated/completed items
- STRENGTHEN existing entries with new context
- CREATE NARRATIVE COHERENCE across all fields

**STRICT LIMITS** (must not exceed):
- coreIdentities: MAX 5 | currentTasks: MAX 10 | currentInterests: MAX 8
- personalPreferences: MAX 8
- patterns: MAX 15

Return the EVOLVED profile that tells a coherent, specific story about this person's current life and work.

IMPORTANT: Return only valid JSON matching the schema. Do not include markdown formatting, code blocks, or any other text.`;

// Prompt builders
export function buildChunkingPrompt(timestamps: number[]): string {
	return `Group these ${timestamps.length} timestamps into browsing sessions.

Indexed timestamps:
${timestamps
	.map((ts, index) => {
		const d = new Date(ts);
		return `[${index}] ${d.toLocaleDateString()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
	})
	.join("\n")}`;
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
	return `Analyze this browsing history data and create a detailed user profile:

DATA CHUNK (${items.length} items):
Time: ${items[0]?.lastVisitTime ? new Date(items[0].lastVisitTime).toLocaleDateString() : "unknown"} to ${items[items.length - 1]?.lastVisitTime ? new Date(items[items.length - 1]?.lastVisitTime || 0).toLocaleDateString() : "unknown"}

Data (d=domain, p=path, q=query params, t=title, ts=timestamp, v=visits):
${JSON.stringify(historyData)}

Analyze this data to create a comprehensive user profile and identify workflow patterns. Be specific and use evidence from the browsing data.`;
}

export function buildMergePrompt(
	existingMemory: {
		userProfile: UserProfile;
		patterns: WorkflowPattern[];
	},
	newResults: {
		userProfile: UserProfile;
		patterns: WorkflowPattern[];
	},
): string {
	return `Merge the new analysis results with existing memory:

EXISTING MEMORY:
${JSON.stringify(existingMemory)}

NEW ANALYSIS RESULTS:
${JSON.stringify(newResults)}

Intelligently merge these results following the merge rules to create an evolved, coherent profile.`;
}
