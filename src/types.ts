export interface WorkflowPattern {
	pattern: string;
	description: string;
	frequency: number;
	urls: string[];
	timePattern?: string;
	suggestion: string;
	automationPotential: "high" | "medium" | "low";
}

export interface UserProfile {
	// === Stable Background ===
	coreIdentities: string[];
	personalPreferences: {
		category: string;
		preference: string;
	}[];

	// === Current Context ===
	currentTasks: string[];
	currentInterests: string[];

	// === Overall Summary ===
	summary: string;
}

export interface ChunkInfo {
	startTime: Date;
	endTime: Date;
	itemCount: number;
	description: string;
	isFallback?: boolean;
}

export interface AnalysisResult {
	totalUrls: number;
	dateRange: {
		start: Date;
		end: Date;
	};
	patterns: WorkflowPattern[];
	topDomains: { domain: string; count: number }[];
	userProfile: UserProfile;
}

export interface FullAnalysisResult {
	analysis: AnalysisResult;
	diagnostics: {
		chunks: ChunkInfo[];
		chunkingRawResponse?: string;
		chunkingError?: string;
	};
}
