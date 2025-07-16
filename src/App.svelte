<script lang="ts">
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
import { disableAmbientAnalysis } from "./state/ambient-settings.svelte";
import { createTRPCMessageHandler } from "./trpc/chrome-adapter";
import { sidepanelToBackgroundClient } from "./trpc/client";
import { createSidepanelRouter } from "./trpc/sidepanel-router";
import type {
	CustomPrompts,
	FullAnalysisResult,
	MemorySettings,
} from "./types";
import type { AIProviderStatus, AnalysisStatus } from "./types/ui-types";
import { loadAIConfigFromStorage } from "./utils/ai-config";
import type { AIProviderType } from "./utils/ai-interface";
import { clearMemory } from "./utils/analyzer";
import {
	loadMemorySettings,
	saveMemorySettings,
} from "./utils/memory-settings";
import {
	createChromeStorage,
	getStorageData,
	LAST_ANALYSIS_RESULT_KEY,
} from "./utils/storage";

let analysisResult: FullAnalysisResult | null = $state(null);
let memoryAutoExpand = $state(false);
let memorySettings = $state<MemorySettings>({ storeWorkflowPatterns: false });
let customPrompts = $state<CustomPrompts>({});
let currentAIStatus = $state<AIProviderStatus>("unavailable");
let currentProvider = $state<AIProviderType>("chrome");

// Unified analysis state
type AnalysisType = "manual" | "ambient" | null;
let currentAnalysisType = $state<AnalysisType>(null);
let currentAnalysisId = $state<string | null>(null);

// Unified status for both ambient card and progress bar
let analysisStatus = $state<AnalysisStatus>({ status: "idle" });

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
		const response =
			await sidepanelToBackgroundClient.analysis.startManual.mutate({
				historyItems: items,
				customPrompts: customPrompts,
				memorySettings: memorySettings,
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
	workflow: string;
	chunk: string;
	merge: string;
}) {
	customPrompts = {
		userProfilePrompt: prompts.system || undefined,
		workflowPatternsPrompt: prompts.workflow || undefined,
		chunkPrompt: prompts.chunk || undefined,
		mergePrompt: prompts.merge || undefined,
	};
}

// Track previous AI status to detect transitions
let previousAIStatus = $state<AIProviderStatus | null>(null);

// Effect to disable ambient analysis when AI becomes unavailable
// Only disable if it was previously available (not on initial load)
// Don't disable during loading state (provider switching)
$effect(() => {
	if (
		previousAIStatus === "available" &&
		currentAIStatus !== "available" &&
		currentAIStatus !== "loading" &&
		currentAIStatus !== null
	) {
		console.log("[App] AI became unavailable, disabling ambient analysis");
		disableAmbientAnalysis().catch((error) => {
			console.error("[App] Failed to disable ambient analysis:", error);
		});
	}
	previousAIStatus = currentAIStatus;
});

async function handleClearMemory() {
	if (confirm("This will clear all stored analysis memory. Continue?")) {
		await clearMemory();
		alert("Memory cleared. Next analysis will start fresh.");
	}
}

async function handleToggleWorkflowPatterns(event: Event) {
	const target = event.target as HTMLInputElement;
	const newValue = target.checked;

	// Warn user when toggling from on to off
	if (memorySettings.storeWorkflowPatterns && !newValue) {
		const confirmed = confirm(
			"Warning: Disabling workflow patterns will stop analyzing, storing, and displaying workflow patterns. " +
				"Current workflow pattern data will be cleared from memory. " +
				"This action cannot be undone. Continue?",
		);

		if (!confirmed) {
			// Revert the checkbox state
			target.checked = memorySettings.storeWorkflowPatterns;
			return;
		}

		// Clear existing pattern data from memory when disabling
		try {
			await sidepanelToBackgroundClient.memory.clearPatterns.mutate();
		} catch (error) {
			console.error("Failed to clear pattern data:", error);
		}
	}

	// Update settings
	memorySettings.storeWorkflowPatterns = newValue;
	console.log("🔧 Saving memory settings:", memorySettings);
	await saveMemorySettings(memorySettings);
	console.log("🔧 Memory settings saved successfully");
}

async function handleCancelAnalysis() {
	if (!currentAnalysisId) {
		console.log("No analysis to cancel");
		return;
	}

	try {
		const response = await sidepanelToBackgroundClient.analysis.cancel.mutate({
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

		// Set loading state while initializing the provider
		currentAIStatus = "loading";

		// Always rely on offscreen document for AI status, regardless of provider
		await sidepanelToBackgroundClient.ai.initialize.mutate().catch((error) => {
			console.log("[App] Error initializing AI:", error);
			// Only set to unavailable if we're still in loading state
			if (currentAIStatus === "loading") {
				currentAIStatus = "unavailable";
			}
		});
	} catch (error) {
		console.error("Error checking initial AI status:", error);
		// Only set to unavailable if we're still in loading state
		if (currentAIStatus === "loading") {
			currentAIStatus = "unavailable";
		}
	}
}

async function handleChromeAIRefresh() {
	if (currentProvider !== "chrome") return;

	console.log("[App] Refreshing Chrome AI status...");
	// Send initialize message to trigger status check in offscreen
	await sidepanelToBackgroundClient.ai.initialize.mutate().catch((error) => {
		console.log("[App] Error refreshing Chrome AI status:", error);
	});
}

// Query ambient analysis status on mount and listen for updates
onMount(() => {
	// Check AI status first
	checkInitialAIStatus();

	// Load memory settings
	loadMemorySettings().then((settings) => {
		memorySettings = settings;
	});

	// Load any previous analysis results
	const storage = createChromeStorage();
	if (storage) {
		getStorageData(storage, LAST_ANALYSIS_RESULT_KEY).then((storedResult) => {
			if (storedResult.isOk() && storedResult.value) {
				analysisResult = storedResult.value;
			}
		});
	}

	// Create sidepanel router for receiving broadcasts from background
	const sidepanelRouter = createSidepanelRouter({
		onStatusUpdate: (data) => {
			// Handle status updates the same way as before
			if (!data?.status) {
				console.warn("[App] Received status update with no status:", data);
				return;
			}
			match(data.status as "running" | "completed" | "skipped" | "error")
				.with("running", () => {
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
				.with("completed", async () => {
					analysisStatus = {
						status: "completed",
						message: data.message || "Analysis completed",
						itemCount: data.itemCount,
					};

					// Update UI state
					isAnalyzing = false;
					analysisPhase = "complete";
					memoryAutoExpand = true;

					// Clear analysis type
					currentAnalysisType = null;
					currentAnalysisId = null;

					// Load results from storage
					const storage = createChromeStorage();
					if (storage) {
						const storedResult = await getStorageData(
							storage,
							LAST_ANALYSIS_RESULT_KEY,
						);
						if (storedResult.isOk() && storedResult.value) {
							analysisResult = storedResult.value;
						}
					}

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
		},
		onProgressUpdate: (data) => {
			console.log("[App] Progress update:", data);
			analysisPhase = data.phase as AnalysisPhase;
			subPhase = data.subPhase as SubPhase | undefined;
			if (data.chunkProgress) {
				chunkProgress = data.chunkProgress;
			}
		},
		onAIStatusUpdate: (data) => {
			console.log("[App] AI status update:", data?.status, data?.error);
			if (!data?.status) {
				console.warn("[App] Received AI status update with no status:", data);
				return;
			}
			// Map status to AIProviderStatus
			if (data.status === "available") {
				currentAIStatus = "available";
			} else if (data.status === "initializing") {
				// Keep current status while initializing
			} else {
				// All other statuses (error) map to unavailable
				currentAIStatus = "unavailable";
			}
		},
	});

	// Set up message handler for receiving tRPC broadcasts
	const messageHandler = createTRPCMessageHandler(
		sidepanelRouter,
		undefined,
		(message) => {
			// Only accept messages targeted to sidepanel (from background broadcasts)
			const msg = message as { target?: string };
			return msg.target === "sidepanel";
		},
	);
	chrome.runtime.onMessage.addListener(messageHandler);

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

	// No more tRPC subscriptions needed - removing subscription setup

	// Query current status from background
	sidepanelToBackgroundClient.ambient.queryStatus
		.query()
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
	sidepanelToBackgroundClient.analysis.getState
		.query()
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

	// All status/progress/AI updates now handled via the sidepanel router and message handler above

	// Cleanup
	return () => {
		chrome.storage.onChanged.removeListener(storageListener);
		chrome.runtime.onMessage.removeListener(messageHandler);
	};
});
</script>

<main class="p-4 max-w-full">
	<div class="max-w-4xl mx-auto">
		<h3 class="text-lg font-semibold mb-6">Memory Inspector</h3>

		<!-- AI Provider Status -->
		<div class="bg-white rounded-lg shadow-sm p-3 mb-4">
			<AIProviderStatusComponent 
				status={currentAIStatus}
				providerType={currentProvider}
				onRefresh={handleChromeAIRefresh}
			/>
		</div>

		<!-- Ambient Analysis Card - Prominent position -->
		<AmbientAnalysisCard {analysisStatus} aiStatus={currentAIStatus} />

		<!-- History Fetcher - Collapsible Section -->
		<CollapsibleSection title="Manual History Analysis" class="mt-4">
			<HistoryFetcher 
				onAnalysisRequest={handleAnalysis} 
				{isAnalyzing}
				isAmbientAnalysisRunning={isAnyAnalysisRunning}
				aiStatus={currentAIStatus}
				provider={currentProvider}
			/>
		</CollapsibleSection>

		<AnalysisProgress 
			phase={analysisPhase} 
			{chunkProgress}
			{subPhase}
			onCancel={handleCancelAnalysis}
			isAmbientAnalysis={isAmbientAnalysisRunning}
		/>

		<!-- Memory Viewer -->
		<div class="mt-4">
			<MemoryViewer autoExpand={memoryAutoExpand} memorySettings={memorySettings} />
		</div>

		<!-- Memory Management -->
		<CollapsibleSection title="Memory Management" class="mt-4">
			<p class="text-sm text-gray-600 mb-4">
				Analysis memory helps improve results by remembering patterns from previous sessions.
			</p>
			
			<!-- Pattern Storage Settings -->
			<div class="mb-4">
				<h4 class="text-sm font-medium text-gray-900 mb-3">Pattern Storage</h4>
				<div class="bg-gray-50 rounded-lg p-3">
					<label class="flex items-center space-x-2">
						<input
							type="checkbox"
							checked={memorySettings.storeWorkflowPatterns}
							onchange={handleToggleWorkflowPatterns}
							class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
						/>
						<span class="text-sm text-gray-700">Store workflow patterns</span>
					</label>
					<p class="text-xs text-gray-500 mt-2">
						When enabled, the system analyzes and stores workflow patterns from your browsing history. 
						Disabling this will reduce prompt size and skip pattern analysis.
					</p>
				</div>
			</div>
			
			<!-- Divider -->
			<div class="border-t border-gray-200 my-4"></div>
			
			<!-- Memory Actions -->
			<div>
				<h4 class="text-sm font-medium text-gray-900 mb-3">Memory Actions</h4>
				<div class="bg-gray-50 rounded-lg p-3">
					<button
						type="button"
						onclick={handleClearMemory}
						class="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-red-500"
					>
						Clear Memory
					</button>
					<p class="text-xs text-gray-500 mt-2">
						This will permanently delete all stored analysis memory including user profile and workflow patterns.
					</p>
				</div>
			</div>
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
			<div class="mt-4">
				<AnalysisResults result={analysisResult} onDismiss={handleDismissAnalysis} memorySettings={memorySettings} />
			</div>
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