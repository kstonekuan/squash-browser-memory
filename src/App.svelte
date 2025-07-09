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
import { disableAmbientAnalysis } from "./stores/ambient-store";
// All messaging now handled via tRPC
import { trpc } from "./trpc/client";
import type { AnalysisProgress as AnalysisProgressType } from "./trpc/schemas";
import type { FullAnalysisResult } from "./types";
import { loadAIConfigFromStorage } from "./utils/ai-config";
import type { AIProviderStatus, AIProviderType } from "./utils/ai-interface";
import { clearMemory } from "./utils/analyzer";

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
		const response = await trpc.analysis.startManual.mutate({
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
		const response = await trpc.analysis.cancel.mutate({
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

		// Always rely on offscreen document for AI status, regardless of provider
		currentAIStatus = "unavailable"; // Default until we hear from offscreen
		await trpc.ai.initialize.mutate().catch((error) => {
			console.log("[App] Error initializing AI:", error);
		});
	} catch (error) {
		console.error("Error checking initial AI status:", error);
		currentAIStatus = "unavailable";
	}
}

async function handleChromeAIRefresh() {
	if (currentProvider !== "chrome") return;

	console.log("[App] Refreshing Chrome AI status...");
	// Send initialize message to trigger status check in offscreen
	await trpc.ai.initialize.mutate().catch((error) => {
		console.log("[App] Error refreshing Chrome AI status:", error);
	});
}

// Query ambient analysis status on mount and listen for updates
onMount(() => {
	// Check AI status first
	checkInitialAIStatus();

	// Set up tRPC subscriptions
	let statusUnsubscribe: { unsubscribe: () => void } | null = null;
	let progressUnsubscribe: { unsubscribe: () => void } | null = null;

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
	trpc.ambient.queryStatus
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
	trpc.analysis.getState
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

	// Set up tRPC status subscription
	statusUnsubscribe = trpc.analysis.onStatus.subscribe(undefined, {
		onData: (data) => {
			// Handle status updates the same way as onMessage
			match(data.status as "started" | "completed" | "skipped" | "error")
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
		},
		onError: (error) => {
			console.error("Status subscription error:", error);
		},
	});

	// Status updates now handled via tRPC subscription above

	// Progress updates now handled via tRPC subscription

	// Set up progress subscription when we have an analysis ID
	$effect(() => {
		if (currentAnalysisId && !progressUnsubscribe) {
			progressUnsubscribe = trpc.analysis.onProgress.subscribe(
				{ analysisId: currentAnalysisId },
				{
					onData: (data: AnalysisProgressType) => {
						console.log("[App] tRPC progress update:", data);
						analysisPhase = data.phase;
						subPhase = data.subPhase;
						if (data.chunkProgress) {
							chunkProgress = data.chunkProgress;
						}
					},
					onError: (error) => {
						console.error("Progress subscription error:", error);
					},
				},
			);
		} else if (!currentAnalysisId && progressUnsubscribe) {
			// Clean up subscription when analysis is done
			progressUnsubscribe.unsubscribe();
			progressUnsubscribe = null;
		}
	});

	// Set up AI status subscription
	let aiStatusUnsubscribe: { unsubscribe: () => void } | null = null;
	aiStatusUnsubscribe = trpc.ai.onStatus.subscribe(undefined, {
		onData: (data) => {
			console.log("[App] AI status update:", data.status, data.error);
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
		onError: (error) => {
			console.error("AI status subscription error:", error);
		},
	});

	// Cleanup
	return () => {
		chrome.storage.onChanged.removeListener(storageListener);
		statusUnsubscribe?.unsubscribe();
		progressUnsubscribe?.unsubscribe();
		aiStatusUnsubscribe?.unsubscribe();
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
			<MemoryViewer autoExpand={memoryAutoExpand} />
		</div>

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