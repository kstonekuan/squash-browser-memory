export type AIProvider = "openai" | "gemini" | "chrome";

export interface ChromeHistoryItem {
	id: string;
	url: string;
	title: string;
	lastVisitTime: string;
	visitCount: number;
	typedCount: number;
}

export interface WorkflowPattern {
	pattern: string;
	description: string;
	frequency: number;
	urls: string[];
	timePattern?: string;
	suggestion: string;
	automationPotential: "high" | "medium" | "low";
}

export interface StandardizedHistoryItem {
	timestamp: string; // ISO string for consistency
	url: string;
	domain: string;
	title: string;
	visitCount?: number;
}

export interface StandardizedHistoryData {
	items: StandardizedHistoryItem[];
	totalUrls: number;
	topDomains: { domain: string; count: number }[];
	dateRange: {
		start: string; // ISO string
		end: string; // ISO string
	};
}

export interface AnalysisResult {
	totalUrls: number;
	dateRange: {
		start: Date;
		end: Date;
	};
	patterns: WorkflowPattern[];
	topDomains: { domain: string; count: number }[];
}
