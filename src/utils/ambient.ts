/// <reference types="@types/dom-chromium-ai" />

import { analyzeHistoryItems } from "./analyzer";
import { loadMemory } from "./memory";

// Settings key for auto-analysis configuration
const AUTO_ANALYSIS_SETTINGS_KEY = "auto_analysis_settings";

export interface AutoAnalysisSettings {
	enabled: boolean;
	notifyOnSuccess: boolean;
	notifyOnError: boolean;
	lastRunTimestamp?: number;
	lastRunStatus?: "success" | "error";
	lastRunError?: string;
}

// Default settings
const defaultAutoAnalysisSettings: AutoAnalysisSettings = {
	enabled: false,
	notifyOnSuccess: true,
	notifyOnError: true,
};

// Load auto-analysis settings
export async function loadAutoAnalysisSettings(): Promise<AutoAnalysisSettings> {
	const result = await chrome.storage.local.get(AUTO_ANALYSIS_SETTINGS_KEY);
	return {
		...defaultAutoAnalysisSettings,
		...(result[AUTO_ANALYSIS_SETTINGS_KEY] || {}),
	};
}

// Save auto-analysis settings
export async function saveAutoAnalysisSettings(
	settings: AutoAnalysisSettings,
): Promise<void> {
	await chrome.storage.local.set({
		[AUTO_ANALYSIS_SETTINGS_KEY]: settings,
	});
}

// Create notification
async function createNotification(
	title: string,
	message: string,
	type: "success" | "error",
): Promise<void> {
	const iconPath =
		type === "success" ? "icons/icon-48.svg" : "icons/icon-48.svg";

	// Create a unique notification ID
	const notificationId = `history-analyzer-${Date.now()}`;

	await chrome.notifications.create(notificationId, {
		type: "basic",
		iconUrl: iconPath,
		title,
		message,
		priority: type === "error" ? 2 : 1,
	});

	// Auto-clear success notifications after 10 seconds
	if (type === "success") {
		setTimeout(() => {
			chrome.notifications.clear(notificationId);
		}, 10000);
	}
}

// Main ambient analysis function
export async function runAmbientAnalysis(): Promise<void> {
	console.log("[Ambient Analysis] Starting hourly analysis...");

	const settings = await loadAutoAnalysisSettings();

	// Check if auto-analysis is enabled
	if (!settings.enabled) {
		console.log("[Ambient Analysis] Auto-analysis is disabled, skipping.");
		return;
	}

	const startTime = Date.now();

	try {
		// Load memory to get the last analyzed timestamp
		const memory = await loadMemory();
		const lastTimestamp = memory?.lastHistoryTimestamp || 0;

		console.log(
			`[Ambient Analysis] Last analyzed timestamp: ${
				lastTimestamp > 0 ? new Date(lastTimestamp).toISOString() : "never"
			}`,
		);

		// Fetch history since last analysis
		// If never analyzed, get last hour of history
		const searchStartTime =
			lastTimestamp > 0 ? lastTimestamp + 1 : Date.now() - 60 * 60 * 1000;

		const historyItems = await chrome.history.search({
			text: "",
			startTime: searchStartTime,
			endTime: Date.now(),
			maxResults: 5000,
		});

		console.log(
			`[Ambient Analysis] Found ${historyItems.length} new history items since last analysis`,
		);

		// Skip if no new history
		if (historyItems.length === 0) {
			console.log("[Ambient Analysis] No new history to analyze");

			// Update last run timestamp
			await saveAutoAnalysisSettings({
				...settings,
				lastRunTimestamp: Date.now(),
				lastRunStatus: "success",
			});
			return;
		}

		// Run analysis
		console.log("[Ambient Analysis] Starting analysis...");
		const result = await analyzeHistoryItems(
			historyItems,
			undefined, // Use default prompts
			(progress) => {
				// Log progress for debugging
				console.log(
					`[Ambient Analysis] Progress: ${progress.phase}`,
					progress.chunkDescription || "",
				);
			},
		);

		console.log(
			`[Ambient Analysis] Analysis completed successfully in ${
				(Date.now() - startTime) / 1000
			}s`,
		);
		console.log(`[Ambient Analysis] Found ${result.patterns.length} patterns`);

		// Update settings with success
		await saveAutoAnalysisSettings({
			...settings,
			lastRunTimestamp: Date.now(),
			lastRunStatus: "success",
			lastRunError: undefined,
		});

		// Send success notification if enabled
		if (settings.notifyOnSuccess) {
			const message = `Analyzed ${historyItems.length} new items. Found ${result.patterns.length} workflow patterns.`;
			await createNotification("History Analysis Complete", message, "success");
		}
	} catch (error) {
		console.error("[Ambient Analysis] Error:", error);

		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";

		// Update settings with error
		await saveAutoAnalysisSettings({
			...settings,
			lastRunTimestamp: Date.now(),
			lastRunStatus: "error",
			lastRunError: errorMessage,
		});

		// Send error notification if enabled
		if (settings.notifyOnError) {
			await createNotification(
				"History Analysis Failed",
				`Ambient analysis encountered an error: ${errorMessage}`,
				"error",
			);
		}

		// Re-throw to let the caller handle it
		throw error;
	}
}
