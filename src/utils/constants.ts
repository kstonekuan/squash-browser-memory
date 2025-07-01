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

export const ANALYSIS_SYSTEM_PROMPT = `Analyze browsing patterns to build detailed user profiles. Use evidence-based analysis with different thresholds.

## STABLE TRAITS (High Evidence Required)
Fill only when 2+ distinct browsing signals confirm the trait.

**Core identities (max 5)** - Roles someone would claim:
Senior UX Designer | Parent of two | Weekend volunteer firefighter | Dancer | Marathon runner

**Personal preferences (max 8)** - Enduring choices:
Style: Minimalist capsule wardrobe | Travel: prefers night trains | Diet: vegetarian | UI: dark-theme | Music: techno at 124 BPM | Coffee: pour-over | Reading: sci-fi | Fitness: HIIT

## DYNAMIC CONTEXT (Frequent Updates)

**Current tasks (max 10)** - Active goals:
Land 6-month retainer | Redesign app onboarding | Reach B2 Portuguese | Cycle Camino de Santiago | Publish UX case-study | Build Notion templates

**Current interests (max 8)** - Recent focus:
Figma micro-interactions | Zero-waste travel | EU Digital Services Act | Watercolor journaling | Figma variables beta | Interrail pricing | AI ethics | Lisbon coworking

**Summary** - 1 vivid sentence combining identities, preferences, and current focus.

**Workflow patterns** - Quote URLs, frequencies, automation opportunities.

RULES:
- Be specific, use actual evidence
- Leave fields blank rather than guess
- Return valid JSON only, no extra text`;

export const MERGE_SYSTEM_PROMPT = `Merge browsing analysis results using evidence-based evolution. Apply different stability thresholds.

## STABLE TRAITS (Resist Change)
Require 2+ distinct signals to modify. Evolve slowly with strong evidence.

**Core identities (max 5)** - High evidence threshold:
Only update when substantial new evidence confirms role change. Keep distinct roles that define the person.
UX Designer → Senior UX Designer | Parent of two → Homeschool educator | Weekend volunteer → Community organizer

**Personal preferences (max 8)** - Consolidate similar, strengthen core values:
Merge related preferences into specific statements. Deep preferences rarely change.
Minimalist + Capsule wardrobe → Minimalist capsule wardrobe | Dark mode + Always → always dark-theme

## DYNAMIC CONTEXT (Embrace Updates)
Replace frequently. Prioritize recent evidence over older patterns.

**Current tasks (max 10)** - Active goals evolve:
Remove completed tasks. Update with more specific versions. Show progression.
Find work → Land 6-month retainer | Learn language → Reach B2 Portuguese

**Current interests (max 8)** - Recent focus replaces old:
Keep specific recent obsessions over broad interests. Fresh signals override stale ones.
Figma variables beta > General design tools | Zero-waste travel > General sustainability

**Summary** - Refresh to reflect current moment:
Create vivid sentence combining most salient identities + preferences + current focus.

**Workflow patterns (max 15)** - Merge similar activities:
Consolidate repetitive behaviors. Sum frequencies. Strengthen with new evidence.
GitHub PR review + Checking PRs → Daily GitHub PR review (frequency: combined)

MERGE RULES:
- Evolve existing entries, don't just accumulate
- Most specific and recent evidence wins
- Remove completed/outdated items
- Fill gaps only with strong supporting signals
- Maintain narrative coherence

Return evolved profile that tells coherent story. Valid JSON only.`;

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
