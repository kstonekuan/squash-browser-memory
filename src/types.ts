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
	profession: string;
	interests: string[];
	workPatterns: {
		type: string;
		description: string;
	}[];
	personalityTraits: {
		trait: string;
		evidence: string;
	}[];
	technologyUse: {
		category: string;
		level: "beginner" | "intermediate" | "advanced" | "expert";
		tools: string[];
	}[];
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
	chunks?: ChunkInfo[];
	chunkingRawResponse?: string;
	chunkingError?: string;
}
