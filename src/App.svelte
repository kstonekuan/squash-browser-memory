<script lang="ts">
import { onMount } from "svelte";
import AdvancedSettings from "./lib/AdvancedSettings.svelte";
import AIProviderStatus from "./lib/AIProviderStatus.svelte";
import AmbientAnalysisCard from "./lib/AmbientAnalysisCard.svelte";
import type { AnalysisPhase, SubPhase } from "./lib/AnalysisProgress.svelte";
import AnalysisProgress from "./lib/AnalysisProgress.svelte";
import AnalysisResults from "./lib/AnalysisResults.svelte";
import CollapsibleSection from "./lib/CollapsibleSection.svelte";
import HistoryFetcher from "./lib/HistoryFetcher.svelte";
import MemoryViewer from "./lib/MemoryViewer.svelte";
import type { FullAnalysisResult } from "./types";
import { analyzeHistoryItems, clearMemory } from "./utils/analyzer";
import { onMessage, sendMessage } from "./utils/messaging";

let analysisResult: FullAnalysisResult | null = $state(null);
let memoryAutoExpand = $state(false);
let isAnalyzing = $state(false);
let analysisPhase: AnalysisPhase = $state("idle");
let rawHistoryData: chrome.history.HistoryItem[] | null = $state(null);
let customPrompts = $state<{
	systemPrompt?: string;
	chunkPrompt?: string;
	mergePrompt?: string;
}>({});
let chunkProgress = $state<{
	current: number;
	total: number;
	description: string;
} | null>(null);
let subPhase: SubPhase | undefined = $state(undefined);
let abortController: AbortController | null = null;
let providerKey = $state(0); // Key to force AIProviderStatus re-render
let isAmbientAnalysisRunning = $state(false);
let isManualAnalysisRunning = $state(false);
let currentAnalysisId: string | null = $state(null);
let ambientAnalysisStatus = $state<{
	status: "idle" | "running" | "completed" | "skipped" | "error";
	message?: string;
	itemCount?: number;
	reason?: string;
}>({ status: "idle" });

async function handleAnalysis(
	event: CustomEvent<{ items: chrome.history.HistoryItem[] }>,
) {
	const { items } = event.detail;

	console.log("[App] Starting manual analysis for", items.length, "items");

	isAnalyzing = true;
	analysisResult = null;
	analysisPhase = "calculating";
	rawHistoryData = items;

	// Mark as manual analysis to track properly
	isManualAnalysisRunning = true;

	try {
		// Send analysis request to background script

		const response = await sendMessage("analysis:start-manual", {
			historyItems: items,
			customPrompts: customPrompts,
		});

		if (!response.success) {
			// Check if it's blocked by ambient analysis
			if (response.error?.includes("Ambient analysis is currently running")) {
				alert(
					"Cannot start manual analysis while ambient analysis is running. Please wait for it to complete.",
				);
				analysisPhase = "idle";
				isAnalyzing = false;
				isManualAnalysisRunning = false;
				return;
			}
			throw new Error(response.error || "Failed to start analysis");
		}

		// Store the analysis ID for cancellation
		currentAnalysisId = response.analysisId || null;

		// Analysis is now running in background
		// Don't set phase here - let progress updates handle it
		ambientAnalysisStatus = {
			status: "running",
			message: `Analyzing ${items.length} history items...`,
		};
	} catch (error) {
		console.error("Failed to start manual analysis:", error);
		analysisPhase = "error";
		isAnalyzing = false;
		isManualAnalysisRunning = false;
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

function handleProviderChange() {
	// Force re-render of AIProviderStatus by changing the key
	providerKey += 1;
}

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
			// Update UI
			analysisPhase = "error";
			isAnalyzing = false;
			isManualAnalysisRunning = false;
			currentAnalysisId = null;
			ambientAnalysisStatus = {
				status: "error",
				message: "Analysis cancelled by user",
			};
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

// Query ambient analysis status on mount and listen for updates
onMount(() => {
	// Query current status from background
	sendMessage("ambient:query-status")
		.then((response) => {
			if (response?.isRunning) {
				isAmbientAnalysisRunning = true;
			}
		})
		.catch(() => {
			// Ignore errors - background might not be ready
		});

	// Also query current analysis state
	sendMessage("analysis:get-state")
		.then((response) => {
			if (response?.isRunning) {
				isManualAnalysisRunning = response.isManualAnalysisRunning;
				isAmbientAnalysisRunning = response.isAmbientAnalysisRunning;
				isAnalyzing =
					response.isManualAnalysisRunning || response.isAmbientAnalysisRunning;
				currentAnalysisId = response.analysisId || null;
				analysisPhase = (response.phase as AnalysisPhase) || "analyzing";
				if (response.chunkProgress) {
					chunkProgress = response.chunkProgress;
				}
			}
		})
		.catch(() => {
			// Ignore errors
		});

	// Listen for analysis status updates
	onMessage("analysis:status", async (message) => {
		const data = message.data;
		switch (data.status) {
			case "started":
				isAmbientAnalysisRunning = true;
				ambientAnalysisStatus = {
					status: "running",
					message: data.message || "Starting analysis...",
				};
				break;
			case "completed":
				isAmbientAnalysisRunning = false;
				ambientAnalysisStatus = {
					status: "completed",
					message: data.message || "Analysis completed",
					itemCount: data.itemCount,
				};

				// If this was a manual analysis, update the UI accordingly
				if (isManualAnalysisRunning) {
					isManualAnalysisRunning = false;
					isAnalyzing = false;
					analysisPhase = "complete";
					currentAnalysisId = null;
					// Note: We don't have the full analysis result here since it ran in the background
					// The user will need to check the Memory Viewer to see the updated results
					memoryAutoExpand = true;
				}

				// Reset to idle after 10 seconds
				setTimeout(() => {
					if (ambientAnalysisStatus.status === "completed") {
						ambientAnalysisStatus = { status: "idle" };
					}
					if (analysisPhase === "complete") {
						analysisPhase = "idle";
					}
				}, 10000);
				break;
			case "skipped":
				isAmbientAnalysisRunning = false;
				ambientAnalysisStatus = {
					status: "skipped",
					message: data.message || "Analysis skipped",
					reason: data.reason,
				};
				// Reset to idle after 10 seconds
				setTimeout(() => {
					if (ambientAnalysisStatus.status === "skipped") {
						ambientAnalysisStatus = { status: "idle" };
					}
				}, 10000);
				break;
			case "error":
				isAmbientAnalysisRunning = false;
				ambientAnalysisStatus = {
					status: "error",
					message: data.message || "Analysis failed",
				};

				// If this was a manual analysis, update the UI accordingly
				if (isManualAnalysisRunning) {
					isManualAnalysisRunning = false;
					isAnalyzing = false;
					analysisPhase = "error";
					currentAnalysisId = null;
				}
				break;
		}
	});

	// Listen for analysis progress updates
	onMessage("analysis:progress", async (message) => {
		const data = message.data;

		// Update UI with progress information
		// Check if it's our analysis (manual or ambient)
		const isOurAnalysis =
			(data.analysisId && data.analysisId === currentAnalysisId) ||
			(data.analysisId?.startsWith("manual-") && isManualAnalysisRunning) ||
			(data.analysisId?.startsWith("ambient-") && isAmbientAnalysisRunning);

		if (isOurAnalysis) {
			analysisPhase = data.phase;
			subPhase = data.subPhase;
			if (data.chunkProgress) {
				chunkProgress = data.chunkProgress;
			}
		}
	});

	// Handle ambient analysis triggers (when side panel is open during ambient analysis)
	// This maintains compatibility with the existing flow
	chrome.runtime.onMessage.addListener(async (message) => {
		if (message.type === "ambient-analysis-trigger" && message.historyItems) {
			console.log(
				"[Ambient] Received analysis trigger for",
				message.historyItems.length,
				"items",
			);

			// Run the analysis locally in the side panel
			isAnalyzing = true;
			analysisResult = null;
			analysisPhase = "calculating";
			rawHistoryData = message.historyItems;
			isAmbientAnalysisRunning = true;

			ambientAnalysisStatus = {
				status: "running",
				message: "Analyzing new browsing history...",
			};

			abortController = new AbortController();

			try {
				const result = await analyzeHistoryItems(
					message.historyItems,
					customPrompts,
					(info) => {
						analysisPhase = info.phase;
						subPhase = info.subPhase;
						if (info.currentChunk && info.totalChunks) {
							chunkProgress = {
								current: info.currentChunk,
								total: info.totalChunks,
								description: info.chunkDescription || "",
							};
						} else if (info.chunkDescription) {
							if (chunkProgress) {
								chunkProgress.description = info.chunkDescription;
							} else {
								chunkProgress = {
									current: 0,
									total: 0,
									description: info.chunkDescription,
								};
							}
						}
					},
					abortController.signal,
				);

				analysisResult = result;
				analysisPhase = "complete";
				chunkProgress = null;
				memoryAutoExpand = true;

				// Send completion message back to background
				await sendMessage("ambient:analysis-complete", {
					success: true,
					itemCount: message.historyItems.length,
				});
			} catch (error) {
				console.error("[Ambient] Analysis error:", error);
				analysisPhase = "error";

				// Send error message back to background
				await sendMessage("ambient:analysis-complete", {
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
					itemCount: message.historyItems.length,
				});
			} finally {
				isAnalyzing = false;
				isAmbientAnalysisRunning = false;
				abortController = null;

				if (analysisPhase === "complete") {
					setTimeout(() => {
						if (analysisPhase === "complete") {
							analysisPhase = "idle";
						}
					}, 3000);
				}
			}
		}
	});
});
</script>

<main class="p-4 max-w-full">
	<div class="max-w-4xl mx-auto">
		<h1 class="text-2xl font-bold mb-6">History Workflow Analyzer</h1>

		<!-- AI Provider Status and History Fetcher together -->
		<div class="bg-white rounded-lg shadow-sm p-4 mb-4">
			{#key providerKey}
				<AIProviderStatus onProviderChange={handleProviderChange} />
			{/key}

			<div class="mt-4 pt-4 border-t border-gray-200">
				<HistoryFetcher 
					on:analysis-request={handleAnalysis} 
					{isAnalyzing}
					isAmbientAnalysisRunning={isAmbientAnalysisRunning}
				/>
			</div>
		</div>

		<!-- Ambient Analysis Card - Prominent position -->
		<AmbientAnalysisCard analysisStatus={ambientAnalysisStatus} />

		<AnalysisProgress 
			phase={analysisPhase} 
			chunkProgress={chunkProgress} 
				subPhase={subPhase}
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
			<AdvancedSettings onPromptsChange={handlePromptsChange} />
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