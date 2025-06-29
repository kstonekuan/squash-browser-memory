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
	// === Stable Background (Core Identity) ===
	profession: string;
	personalityTraits: {
		trait: string;
		evidence: string;
	}[];
	technologyUse: {
		category: string;
		level: "beginner" | "intermediate" | "advanced" | "expert";
		tools: string[];
	}[];
	personalPreferences: {
		category: string;
		preference: string;
	}[];

	// === Current Context (Dynamic/Active) ===
	currentGoals: string[];
	recentObsessions: string[];
	lifecycleHints: string[];
	interests: string[];
	workPatterns: {
		type: string;
		description: string;
	}[];

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
	chunks?: ChunkInfo[];
	chunkingRawResponse?: string;
	chunkingError?: string;
}
