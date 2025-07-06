/**
 * Pure business logic functions for message handlers
 * These functions contain the core logic separated from the messaging infrastructure
 */

import { format } from "date-fns";
import { loadAutoAnalysisSettings } from "./ambient";
import type { AnalysisProgress } from "./messaging";

// Types for our handler functions
export interface AlarmAPI {
	clear: (name: string) => Promise<boolean>;
	create: (
		name: string,
		alarmInfo: chrome.alarms.AlarmCreateInfo,
	) => Promise<void>;
	get: (name: string) => Promise<chrome.alarms.Alarm | null>;
}

// Business logic for auto-analysis toggle
export async function handleAutoAnalysisToggleLogic(
	enabled: boolean,
	alarmName: string,
	alarms: AlarmAPI,
): Promise<{ success: boolean; nextRunTime?: number; error?: string }> {
	try {
		if (enabled) {
			await alarms.clear(alarmName);
			await alarms.create(alarmName, {
				delayInMinutes: 1, // First run after 1 minute
			});

			const alarm = await alarms.get(alarmName);
			if (alarm) {
				console.log(
					`Auto-analysis enabled. Next run: ${format(new Date(alarm.scheduledTime), "PPpp")}`,
				);
				return {
					success: true,
					nextRunTime: alarm.scheduledTime,
				};
			} else {
				console.error("Failed to create analysis alarm");
				return {
					success: false,
					error: "Failed to create alarm",
				};
			}
		} else {
			const cleared = await alarms.clear(alarmName);
			console.log(`Auto-analysis disabled. Alarm cleared: ${cleared}`);
			return {
				success: true,
			};
		}
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

// Business logic for querying next alarm
export async function queryNextAlarmLogic(
	alarmName: string,
	alarms: AlarmAPI,
): Promise<{ nextRunTime?: number; alarmExists: boolean }> {
	const alarm = await alarms.get(alarmName);
	return {
		nextRunTime: alarm ? alarm.scheduledTime : undefined,
		alarmExists: !!alarm,
	};
}

// Business logic for getting analysis state
export function getAnalysisStateLogic(
	isAnalysisRunning: boolean,
	currentAnalysisId: string | null,
	analysisProgressMap: Map<string, AnalysisProgress>,
): {
	isRunning: boolean;
	isManualAnalysisRunning: boolean;
	isAmbientAnalysisRunning: boolean;
	analysisId?: string;
	phase?: string;
	chunkProgress?: AnalysisProgress["chunkProgress"];
	subPhase?: AnalysisProgress["subPhase"];
} {
	const currentProgress = currentAnalysisId
		? analysisProgressMap.get(currentAnalysisId)
		: undefined;

	return {
		isRunning: isAnalysisRunning,
		isManualAnalysisRunning: isAnalysisRunning,
		isAmbientAnalysisRunning: isAnalysisRunning,
		analysisId: currentAnalysisId || undefined,
		phase: currentProgress?.phase,
		chunkProgress: currentProgress?.chunkProgress,
		subPhase: currentProgress?.subPhase,
	};
}

// Business logic for checking if analysis is already running
export function checkAnalysisRunningLogic(isAnalysisRunning: boolean): {
	canStart: boolean;
	error?: string;
} {
	if (isAnalysisRunning) {
		console.log("[Background] Analysis already in progress, skipping.");
		return {
			canStart: false,
			error: "Analysis is already in progress",
		};
	}
	return {
		canStart: true,
	};
}

// Business logic for canceling analysis
export function cancelAnalysisLogic(
	currentAnalysisId: string | null,
	requestedAnalysisId: string,
	activeAnalyses: Map<string, boolean>,
): { shouldCancel: boolean; error?: string } {
	console.log("[Background] Received cancellation request");

	if (!currentAnalysisId || currentAnalysisId !== requestedAnalysisId) {
		return {
			shouldCancel: false,
			error: "No matching analysis in progress",
		};
	}

	if (activeAnalyses.has(requestedAnalysisId)) {
		console.log("[Background] Cancelling analysis:", requestedAnalysisId);
		return { shouldCancel: true };
	} else {
		return {
			shouldCancel: false,
			error: "Analysis not found",
		};
	}
}

// Business logic for handling startup alarm check
export async function handleStartupAlarmCheckLogic(
	alarmName: string,
	alarms: AlarmAPI,
): Promise<void> {
	const alarm = await alarms.get(alarmName);
	if (alarm) {
		console.log(
			"Analysis alarm is active, next run:",
			format(new Date(alarm.scheduledTime), "PPpp"),
		);
	} else {
		console.log("Analysis alarm is not active");

		const settings = await loadAutoAnalysisSettings();
		if (settings.enabled) {
			await alarms.create(alarmName, {
				delayInMinutes: 60, // Schedule next run in 1 hour
			});
			console.log("Re-created analysis alarm");
		}
	}
}

// Business logic for offscreen document management
export function shouldCreateOffscreenDocument(
	existingContexts: chrome.runtime.ExtensionContext[],
): boolean {
	return existingContexts.length === 0;
}

// Business logic for progress storage
export function updateProgressMap(
	analysisId: string,
	progress: AnalysisProgress,
	progressMap: Map<string, AnalysisProgress>,
): void {
	console.log("[Background] Received progress from offscreen:", {
		phase: progress.phase,
		analysisId: progress.analysisId,
		chunkProgress: progress.chunkProgress,
	});

	progressMap.set(analysisId, progress);
}

// Business logic for offscreen analysis management
export function prepareForNewAnalysis(
	currentAnalysisId: string | null,
	activeAnalyses: Map<string, AbortController>,
): void {
	// Cancel any existing analysis
	if (currentAnalysisId && activeAnalyses.has(currentAnalysisId)) {
		const oldController = activeAnalyses.get(currentAnalysisId);
		oldController?.abort();
		activeAnalyses.delete(currentAnalysisId);
	}
}

export function registerAnalysis(
	analysisId: string,
	abortController: AbortController,
	activeAnalyses: Map<string, AbortController>,
): void {
	activeAnalyses.set(analysisId, abortController);
}

export function cleanupAnalysis(
	analysisId: string,
	currentAnalysisId: string | null,
	activeAnalyses: Map<string, AbortController>,
): string | null {
	activeAnalyses.delete(analysisId);
	if (currentAnalysisId === analysisId) {
		return null;
	}
	return currentAnalysisId;
}

export function shouldStopKeepalive(
	activeAnalyses: Map<string, AbortController>,
): boolean {
	return activeAnalyses.size === 0;
}

// Business logic for cancel handler
export function handleCancelLogic(
	analysisId: string,
	activeAnalyses: Map<string, AbortController>,
	currentAnalysisId: string | null,
): {
	success: boolean;
	error?: string;
	newCurrentAnalysisId: string | null;
} {
	if (analysisId && activeAnalyses.has(analysisId)) {
		const controller = activeAnalyses.get(analysisId);
		controller?.abort();
		activeAnalyses.delete(analysisId);

		let newCurrentId = currentAnalysisId;
		if (currentAnalysisId === analysisId) {
			newCurrentId = null;
		}

		return { success: true, newCurrentAnalysisId: newCurrentId };
	} else {
		return {
			success: false,
			error: "Analysis not found",
			newCurrentAnalysisId: currentAnalysisId,
		};
	}
}
