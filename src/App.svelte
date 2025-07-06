<script lang="ts">
/// <reference types="@types/dom-chromium-ai" />

import { onMount } from "svelte";
import { match } from "ts-pattern";
import AdvancedSettings from "./lib/AdvancedSettings.svelte";
import AIProviderStatusComponent from "./lib/AIProviderStatus.svelte";
import AmbientAnalysisCard from "./lib/AmbientAnalysisCard.svelte";
import type { AnalysisPhase, SubPhase } from "./lib/AnalysisProgress.svelte";
import AnalysisProgress from "./lib/AnalysisProgress.svelte";
import AnalysisResults from "./lib/AnalysisResults.svelte";
import CollapsibleSection from "./lib/CollapsibleSection.svelte";
import HistoryFetcher from "./lib/HistoryFetcher.svelte";
import MemoryViewer from "./lib/MemoryViewer.svelte";
import { disableAmbientAnalysis } from "./stores/ambient-store";
import type { FullAnalysisResult } from "./types";
import { loadAIConfigFromStorage } from "./utils/ai-config";
import type {
	AIProvider,
	AIProviderStatus,
	AIProviderType,
} from "./utils/ai-interface";
import { getProvider, resetChromeProvider } from "./utils/ai-provider-factory";
import { clearMemory } from "./utils/analyzer";
import { onMessage, sendMessage } from "./utils/messaging";

let analysisResult: FullAnalysisResult | null = $state(null);
let memoryAutoExpand = $state(false);
let rawHistoryData: chrome.history.HistoryItem[] | null = $state(null);
let customPrompts = $state<{
	systemPrompt?: string;
	chunkPrompt?: string;
	mergePrompt?: string;
}>({});
let currentAIStatus = $state<AIProviderStatus>("unavailable");
let currentProvider = $state<AIProviderType>("chrome");
let aiNeedsDownload = $state(false);
let aiIsDownloading = $state(false);
let currentAIProvider = $state<AIProvider | null>(null);

// Unified analysis state
type AnalysisType = "manual" | "ambient" | null;
let currentAnalysisType = $state<AnalysisType>(null);
let currentAnalysisId = $state<string | null>(null);

// Unified status for both ambient card and progress bar
let analysisStatus = $state<{
	status: "idle" | "running" | "completed" | "skipped" | "error";
	message?: string;
	itemCount?: number;
	reason?: string;
}>({ status: "idle" });

// Analysis progress state
let analysisPhase: AnalysisPhase = $state("idle");
let chunkProgress = $state<{
	current: number;
	total: number;
	description: string;
} | null>(null);
let subPhase: SubPhase | undefined = $state(undefined);

// Derived state
let isAnalyzing = $derived(
	currentAnalysisType === "manual" && analysisStatus.status === "running",
);
let isAmbientAnalysisRunning = $derived(
	currentAnalysisType === "ambient" && analysisStatus.status === "running",
);
let isAnyAnalysisRunning = $derived(analysisStatus.status === "running");

async function handleAnalysis(data: { items: chrome.history.HistoryItem[] }) {
	const { items } = data;

	console.log("[App] Starting manual analysis for", items.length, "items");

	analysisResult = null;
	rawHistoryData = items;

	// Set analysis type and generate ID
	currentAnalysisType = "manual";
	const tempAnalysisId = `manual-${Date.now()}`;
	currentAnalysisId = tempAnalysisId;

	// Update unified status
	analysisStatus = {
		status: "running",
		message: `Analyzing ${items.length} history items...`,
	};
	analysisPhase = "calculating";

	try {
		// Send analysis request to background script
		const response = await sendMessage("analysis:start-manual", {
			historyItems: items,
			customPrompts: customPrompts,
		});

		if (!response.success) {
			// Check if it's blocked by another analysis
			if (response.error?.includes("already in progress")) {
				alert(
					"An analysis is already in progress. Please wait for it to complete.",
				);
				analysisPhase = "idle";
				analysisStatus = { status: "idle" };
				currentAnalysisType = null;
				currentAnalysisId = null;
				return;
			}
			throw new Error(response.error || "Failed to start analysis");
		}

		// Update with the actual analysis ID from response if different
		if (response.analysisId && response.analysisId !== tempAnalysisId) {
			currentAnalysisId = response.analysisId;
		}
	} catch (error) {
		console.error("Failed to start manual analysis:", error);
		analysisPhase = "error";
		analysisStatus = {
			status: "error",
			message:
				error instanceof Error ? error.message : "Failed to start analysis",
		};
		currentAnalysisType = null;
		currentAnalysisId = null;
		alert(error instanceof Error ? error.message : "Failed to start analysis");
	}
}

function handlePromptsChange(prompts: {
	system: string;
	chunk: string;
	merge: string;
}) {
	customPrompts = {
		systemPrompt: prompts.system || undefined,
		chunkPrompt: prompts.chunk || undefined,
		mergePrompt: prompts.merge || undefined,
	};
}

// Effect to disable ambient analysis when AI becomes unavailable
$effect(() => {
	if (currentAIStatus !== "available" && currentAIStatus !== null) {
		console.log("[App] AI is not available, disabling ambient analysis");
		disableAmbientAnalysis().catch((error) => {
			console.error("[App] Failed to disable ambient analysis:", error);
		});
	}
});

async function handleClearMemory() {
	if (confirm("This will clear all stored analysis memory. Continue?")) {
		await clearMemory();
		alert("Memory cleared. Next analysis will start fresh.");
	}
}

async function handleCancelAnalysis() {
	if (!currentAnalysisId) {
		console.log("No analysis to cancel");
		return;
	}

	try {
		const response = await sendMessage("analysis:cancel", {
			analysisId: currentAnalysisId,
		});

		if (response.success) {
			// Update unified state
			analysisPhase = "error";
			analysisStatus = {
				status: "error",
				message: "Analysis cancelled by user",
			};
			currentAnalysisType = null;
			currentAnalysisId = null;
		} else {
			console.error("Failed to cancel analysis:", response.error);
			alert(`Failed to cancel analysis: ${response.error}`);
		}
	} catch (error) {
		console.error("Error cancelling analysis:", error);
		alert("Failed to cancel analysis");
	}
}

function handleDismissAnalysis() {
	analysisResult = null;
	memoryAutoExpand = false;
}

async function checkInitialAIStatus() {
	try {
		const config = await loadAIConfigFromStorage();
		currentProvider = config.provider;

		// For Chrome AI, use offscreen document for initialization
		if (config.provider === "chrome") {
			// Check basic availability first
			if (typeof LanguageModel !== "undefined") {
				const availability = await LanguageModel.availability();
				console.log("[App] Chrome AI availability:", availability);

				if (availability === "downloading") {
					// Chrome AI is currently downloading
					aiIsDownloading = true;
					currentAIStatus = "unavailable";
					// Initialize in offscreen to track the download
					try {
						await sendMessage("chrome-ai:initialize");
					} catch (error) {
						console.log("[App] Error tracking Chrome AI download:", error);
					}
				} else if (availability === "available") {
					currentAIStatus = "available";
				} else if (availability === "downloadable") {
					// Trigger initialization in offscreen to check if download is needed
					currentAIStatus = "unavailable";
					try {
						await sendMessage("chrome-ai:initialize");
					} catch (error) {
						console.log("[App] Error initializing Chrome AI:", error);
					}
				} else {
					// unavailable
					currentAIStatus = "unavailable";
				}
			} else {
				currentAIStatus = "unavailable";
			}
		} else {
			// Non-Chrome AI provider, use local provider for status check
			const provider = getProvider(config);
			currentAIProvider = provider;
			const status = await provider.getStatus();
			currentAIStatus = status;
		}
	} catch (error) {
		console.error("Error checking initial AI status:", error);
		currentAIStatus = "unavailable";
	}
}

async function handleAIDownload() {
	if (currentProvider !== "chrome") return;

	aiNeedsDownload = false;
	aiIsDownloading = true;

	try {
		// Trigger download in offscreen document
		await sendMessage("chrome-ai:trigger-download");
	} catch (error) {
		console.error("Error triggering Chrome AI download:", error);
		currentAIStatus = "unavailable";
		aiIsDownloading = false;
	}
}

// Query ambient analysis status on mount and listen for updates
onMount(() => {
	// Check AI status first
	checkInitialAIStatus();

	// Listen for storage changes to detect provider changes
	const storageListener = (changes: {
		[key: string]: chrome.storage.StorageChange;
	}) => {
		if (changes.ai_config || changes.ai_provider_config) {
			// Provider configuration changed, re-check status
			console.log("[App] AI provider config changed, rechecking status");
			checkInitialAIStatus();
		}
	};
	chrome.storage.onChanged.addListener(storageListener);

	// Query current status from background
	sendMessage("ambient:query-status")
		.then((response) => {
			if (response?.isRunning) {
				currentAnalysisType = "ambient";
				analysisStatus = {
					status: "running",
					message: "Ambient analysis in progress...",
				};
			}
		})
		.catch(() => {
			// Ignore errors - background might not be ready
		});

	// Also query current analysis state
	sendMessage("analysis:get-state")
		.then((response) => {
			if (response?.isRunning) {
				// Determine analysis type from response
				if (response.isAmbientAnalysisRunning) {
					currentAnalysisType = "ambient";
				} else if (response.isManualAnalysisRunning) {
					currentAnalysisType = "manual";
				}

				analysisStatus = {
					status: "running",
					message: "Analysis in progress...",
				};

				currentAnalysisId = response.analysisId || null;
				analysisPhase = (response.phase as AnalysisPhase) || "analyzing";
				if (response.chunkProgress) {
					chunkProgress = response.chunkProgress;
				}
				if (response.subPhase) {
					subPhase = response.subPhase;
				}
			}
		})
		.catch(() => {
			// Ignore errors
		});

	// Listen for analysis status updates
	onMessage("analysis:status", async (message) => {
		const data = message.data;

		match(data.status)
			.with("started", () => {
				// Determine type from message or current state
				if (!currentAnalysisType) {
					currentAnalysisType = data.message?.includes("manual")
						? "manual"
						: "ambient";
				}
				analysisStatus = {
					status: "running",
					message: data.message || "Starting analysis...",
				};
			})
			.with("completed", () => {
				analysisStatus = {
					status: "completed",
					message: data.message || "Analysis completed",
					itemCount: data.itemCount,
				};

				// Update UI state
				if (currentAnalysisType === "manual") {
					isAnalyzing = false;
					analysisPhase = "complete";
					memoryAutoExpand = true;
				}

				// Clear analysis type
				currentAnalysisType = null;
				currentAnalysisId = null;

				// Reset to idle after 10 seconds
				setTimeout(() => {
					if (analysisStatus.status === "completed") {
						analysisStatus = { status: "idle" };
					}
					if (analysisPhase === "complete") {
						analysisPhase = "idle";
					}
				}, 10000);
			})
			.with("skipped", () => {
				analysisStatus = {
					status: "skipped",
					message: data.message || "Analysis skipped",
					reason: data.reason,
				};

				currentAnalysisType = null;
				currentAnalysisId = null;

				// Reset to idle after 10 seconds
				setTimeout(() => {
					if (analysisStatus.status === "skipped") {
						analysisStatus = { status: "idle" };
					}
				}, 10000);
			})
			.with("error", () => {
				analysisStatus = {
					status: "error",
					message: data.message || "Analysis failed",
				};

				// Update UI state for manual analysis
				if (currentAnalysisType === "manual") {
					isAnalyzing = false;
					analysisPhase = "error";
				}

				currentAnalysisType = null;
				currentAnalysisId = null;
			})
			.exhaustive();
	});

	// Listen for analysis progress updates
	onMessage("analysis:progress", async (message) => {
		const data = message.data;

		console.log("[App] Received progress:", {
			phase: data.phase,
			analysisId: data.analysisId,
			currentAnalysisId,
			currentAnalysisType,
			chunkProgress: data.chunkProgress,
		});

		// Update UI with progress information
		// Check if it's our analysis
		const isOurAnalysis =
			data.analysisId && data.analysisId === currentAnalysisId;

		// Fallback: if we're running a manual analysis and get a manual analysis progress update
		// without an exact ID match, it's likely still our analysis (due to timing issues)
		const isLikelyOurAnalysis =
			currentAnalysisType === "manual" &&
			data.analysisId?.startsWith("manual-") &&
			!isOurAnalysis;

		console.log("[App] Analysis ID match:", {
			isOurAnalysis,
			isLikelyOurAnalysis,
			dataId: data.analysisId,
			currentId: currentAnalysisId,
			currentAnalysisType,
		});

		if (isOurAnalysis || isLikelyOurAnalysis) {
			console.log("[App] Updating UI with progress");
			analysisPhase = data.phase;
			subPhase = data.subPhase;
			if (data.chunkProgress) {
				chunkProgress = data.chunkProgress;
			}
			// Update currentAnalysisId if using fallback
			if (isLikelyOurAnalysis && data.analysisId) {
				currentAnalysisId = data.analysisId;
			}
		} else {
			console.log("[App] Ignoring progress - not our analysis");
		}
	});

	// Listen for Chrome AI status updates
	onMessage("offscreen:chrome-ai-status", async (message) => {
		const { status, error } = message.data;
		console.log("[App] Chrome AI status update:", status, error);

		if (currentProvider !== "chrome") return;

		match(status)
			.with("initializing", () => {
				// Keep current state
			})
			.with("downloading", () => {
				aiIsDownloading = true;
				aiNeedsDownload = false;
				currentAIStatus = "unavailable";
			})
			.with("available", () => {
				aiIsDownloading = false;
				aiNeedsDownload = false;
				currentAIStatus = "available";
			})
			.with("error", () => {
				aiIsDownloading = false;
				if (
					error?.includes("needs-download") ||
					error?.includes("needs download")
				) {
					aiNeedsDownload = true;
				}
				currentAIStatus = "unavailable";
			})
			.exhaustive();
	});

	// Cleanup
	return () => {
		chrome.storage.onChanged.removeListener(storageListener);
	};
});
</script>

<main class="p-4 max-w-full">
	<div class="max-w-4xl mx-auto">
		<h1 class="text-2xl font-bold mb-6">History Workflow Analyzer</h1>

		<!-- AI Provider Status and History Fetcher together -->
		<div class="bg-white rounded-lg shadow-sm p-4 mb-4">
			<AIProviderStatusComponent 
				status={currentAIStatus}
				providerType={currentProvider}
				needsDownload={aiNeedsDownload}
				isDownloading={aiIsDownloading}
				onDownloadClick={handleAIDownload}
			/>

			<div class="mt-4 pt-4 border-t border-gray-200">
				<HistoryFetcher 
					onAnalysisRequest={handleAnalysis} 
					{isAnalyzing}
					isAmbientAnalysisRunning={isAnyAnalysisRunning}
					aiStatus={currentAIStatus}
					provider={currentProvider}
				/>
			</div>
		</div>

		<!-- Ambient Analysis Card - Prominent position -->
		<AmbientAnalysisCard {analysisStatus} aiStatus={currentAIStatus} />

		<AnalysisProgress 
			phase={analysisPhase} 
			{chunkProgress}
			{subPhase}
			onCancel={handleCancelAnalysis}
			isAmbientAnalysis={isAmbientAnalysisRunning}
		/>

		<!-- Memory Viewer -->
		<MemoryViewer autoExpand={memoryAutoExpand} />

		<!-- Memory Management -->
		<CollapsibleSection title="Memory Management" class="mt-4">
			<p class="text-sm text-gray-600 mb-4">
				Analysis memory helps improve results by remembering patterns from previous sessions.
			</p>
			<button
				type="button"
				onclick={handleClearMemory}
				class="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-red-500"
			>
				Clear Memory
			</button>
		</CollapsibleSection>

		<!-- Advanced Settings -->
		<div class="mt-4">
			<AdvancedSettings 
				onPromptsChange={handlePromptsChange}
				onProviderChange={checkInitialAIStatus}
				aiStatus={currentAIStatus}
				currentProviderType={currentProvider}
			/>
		</div>

		<!-- Analysis Results -->
		{#if analysisResult}
			<AnalysisResults result={analysisResult} onDismiss={handleDismissAnalysis} />
		{/if}
	</div>
</main>

<style>
	/* Optimize for side panel width */
	:global(body) {
		margin: 0;
		padding: 0;
		min-width: 320px;
		overflow-x: hidden;
	}
	
	/* Ensure content doesn't overflow */
	:global(.prose) {
		max-width: 100%;
	}
	
	/* Adjust grid layouts for narrow width */
	:global(.grid) {
		grid-template-columns: 1fr !important;
	}
</style>