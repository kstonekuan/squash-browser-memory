export interface WorkflowPattern {
	pattern: string;
	description: string;
	frequency: number;
	urls: string[];
	timePattern?: string;
	suggestion: string;
	automationPotential: "high" | "medium" | "low";
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
