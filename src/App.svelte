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
import type { FullAnalysisResult, MemorySettings } from "./types";
import { loadAIConfigFromStorage } from "./utils/ai-config";
import type { AIProviderStatus, AIProviderType } from "./utils/ai-interface";
import { clearMemory } from "./utils/analyzer";
import {
	loadMemorySettings,
	saveMemorySettings,
} from "./utils/memory-settings";
import { onMessage, sendMessage } from "./utils/messaging";

let analysisResult: FullAnalysisResult | null = $state(null);
let memoryAutoExpand = $state(false);
let rawHistoryData: chrome.history.HistoryItem[] | null = $state(null);
let memorySettings = $state<MemorySettings>({ storeWorkflowPatterns: true });
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
			await sendMessage("memory:clear-patterns");
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

		// Always rely on offscreen document for AI status, regardless of provider
		currentAIStatus = "unavailable"; // Default until we hear from offscreen
		await sendMessage("ai:initialize").catch((error) => {
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
	await sendMessage("ai:initialize").catch((error) => {
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

	// Listen for AI status updates from offscreen
	onMessage("offscreen:ai-status", async (message) => {
		const { status, error } = message.data;
		console.log("[App] AI status update:", status, error);

		// Map status to AIProviderStatus
		if (status === "available") {
			currentAIStatus = "available";
		} else if (status === "initializing") {
			// Keep current status while initializing
		} else {
			// All other statuses (error) map to unavailable
			currentAIStatus = "unavailable";
		}
	});

	// Cleanup
	return () => {
		chrome.storage.onChanged.removeListener(storageListener);
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
			
			<!-- Workflow Patterns Toggle -->
			<div class="mb-4">
				<label class="flex items-center space-x-2">
					<input
						type="checkbox"
						checked={memorySettings.storeWorkflowPatterns}
						onchange={handleToggleWorkflowPatterns}
						class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
					/>
					<span class="text-sm text-gray-700">Store workflow patterns</span>
				</label>
				<p class="text-xs text-gray-500 mt-1">
					When enabled, the system analyzes and stores workflow patterns from your browsing history. 
					Disabling this will reduce prompt size and skip pattern analysis.
				</p>
			</div>
			
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
			<AnalysisResults result={analysisResult} onDismiss={handleDismissAnalysis} memorySettings={memorySettings} />
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