// LLM Configuration
export const LLM_CONFIG = {
	openai: {
		parseModel: "gpt-4o-mini",
		analyzeModel: "gpt-4o-mini",
		parseTemperature: 0.1,
		analyzeTemperature: 0.7,
	},
	gemini: {
		parseModel: "gemini-1.5-flash",
		analyzeModel: "gemini-2.0-flash-exp",
		parseTemperature: 0.1,
		analyzeTemperature: 0.7,
	},
} as const;

export const DEFAULT_PARSING_PROMPT = `You are a data parser. Extract browsing history entries and return them as a JSON array.
Each item should have: timestamp (ISO string), url, domain, title.
Be concise and accurate. Return only valid JSON with an "items" array containing the history entries.`;

export const DEFAULT_ANALYSIS_PROMPT = `You are an expert at analyzing browsing patterns to identify repetitive workflows that can be automated or optimized. 
Focus on finding patterns like:
- Regular visits to the same sequence of sites
- Repetitive tasks (checking emails, monitoring dashboards, etc.)
- Time-based patterns (daily, weekly routines)
- Common workflows that could be streamlined

For each pattern, provide:
1. A clear pattern name
2. Description of the workflow
3. Frequency of occurrence
4. Time patterns if applicable
5. Specific automation suggestion
6. Automation potential (high/medium/low)`;

// Mutable versions that can be customized
export let PARSING_SYSTEM_PROMPT = DEFAULT_PARSING_PROMPT;
export let ANALYSIS_SYSTEM_PROMPT = DEFAULT_ANALYSIS_PROMPT;

export function setCustomPrompts(prompts: {
	parsing?: string;
	analysis?: string;
}) {
	if (prompts.parsing) PARSING_SYSTEM_PROMPT = prompts.parsing;
	if (prompts.analysis) ANALYSIS_SYSTEM_PROMPT = prompts.analysis;
}

export function resetPrompts() {
	PARSING_SYSTEM_PROMPT = DEFAULT_PARSING_PROMPT;
	ANALYSIS_SYSTEM_PROMPT = DEFAULT_ANALYSIS_PROMPT;
}
