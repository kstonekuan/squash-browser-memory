/**
 * SDK Type Definitions (duplicated from squash-sdk for extension use)
 * These types are used by the extension to handle SDK API requests
 */

export interface ContextOptions {
	/** Filter context to match specific topics/domains */
	relevanceQuery?: string;
	/** Time window for context: "1h", "24h", "7d", "30d", "all" */
	timeRange?: string;
	/** Maximum tokens to return (default: 1500) */
	maxTokens?: number;
	/** Response format (default: "structured") */
	format?: "raw" | "structured" | "narrative";
}

export interface Pattern {
	name: string;
	description?: string;
	frequency: number;
	lastSeen: number;
}

export interface Topic {
	topic: string;
	relevance: number;
	keywords: string[];
}

interface Activity {
	activity: string;
	timestamp: number;
	relevance: number;
}

export interface Context {
	/** Human-readable summary of browsing patterns */
	summary: string;
	/** Detected workflow patterns */
	patterns: Pattern[];
	/** Key topics/domains of interest */
	topics: Topic[];
	/** Recent relevant activities */
	recentActivities: Activity[];
}
