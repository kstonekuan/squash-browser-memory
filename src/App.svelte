<script lang="ts">
import AdvancedSettings from "./lib/AdvancedSettings.svelte";
import AIProviderStatus from "./lib/AIProviderStatus.svelte";
import AmbientAnalysisCard from "./lib/AmbientAnalysisCard.svelte";
import type { AnalysisPhase, SubPhase } from "./lib/AnalysisProgress.svelte";
import AnalysisProgress from "./lib/AnalysisProgress.svelte";
import AnalysisResults from "./lib/AnalysisResults.svelte";
import HistoryFetcher from "./lib/HistoryFetcher.svelte";
import MemoryViewer from "./lib/MemoryViewer.svelte";
import type { AnalysisResult } from "./types";
import { analyzeHistoryItems, clearMemory } from "./utils/analyzer";

let analysisResult: AnalysisResult | null = $state(null);
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
let retryMessage = $state("");
let subPhase: SubPhase | undefined = $state(undefined);
let abortController: AbortController | null = null;
let providerKey = $state(0); // Key to force AIProviderStatus re-render

async function handleAnalysis(
	event: CustomEvent<{ items: chrome.history.HistoryItem[] }>,
) {
	const { items } = event.detail;

	isAnalyzing = true;
	analysisResult = null;
	analysisPhase = "calculating";
	rawHistoryData = items;

	// Create new abort controller for this analysis
	abortController = new AbortController();

	try {
		// Analyze the history items with progress callback
		const result = await analyzeHistoryItems(
			items,
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
					// Update description even without chunk numbers
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
				if (info.retryMessage) {
					retryMessage = info.retryMessage;
				}
			},
			abortController.signal,
		);
		analysisResult = result;
		analysisPhase = "complete";
		chunkProgress = null;
		// Auto-expand memory when analysis is complete
		memoryAutoExpand = true;
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.toLowerCase().includes("cancelled")
		) {
			console.log("Analysis cancelled by user");
			// analysisPhase already set to "error" in handleCancelAnalysis
			// Don't show alert for user-initiated cancellation
		} else {
			console.error("Analysis error:", error);
			analysisPhase = "error";
			alert(
				error instanceof Error ? error.message : "Failed to analyze history",
			);
		}
	} finally {
		isAnalyzing = false;
		abortController = null;
		// Reset phase after a delay if complete
		if (analysisPhase === "complete") {
			setTimeout(() => {
				if (analysisPhase === "complete") {
					analysisPhase = "idle";
				}
			}, 3000);
		}
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

function handleCancelAnalysis() {
	if (abortController && !abortController.signal.aborted) {
		abortController.abort();
		retryMessage = "";
		analysisPhase = "error";
		isAnalyzing = false;
		chunkProgress = null;
	}
}

function handleDismissAnalysis() {
	analysisResult = null;
	memoryAutoExpand = false;
}
</script>

<main class="min-h-screen bg-gray-50">
	<div class="px-4 py-6">
		<header class="mb-6">
			<h1 class="text-2xl font-bold text-gray-900 mb-2">
				History Analyzer
			</h1>
			<p class="text-sm text-gray-600">
				Find repetitive workflows in your browsing history
			</p>
		</header>

		<div class="bg-white rounded-lg shadow-sm p-4 mb-4">
			{#key providerKey}
				<AIProviderStatus />
			{/key}

			<div class="mt-4 pt-4 border-t border-gray-200">
				<HistoryFetcher 
					bind:isAnalyzing 
					on:analysis-request={handleAnalysis}
				/>
			</div>
		</div>

		<!-- Ambient Analysis Card - Prominent position -->
		<AmbientAnalysisCard />

		<AnalysisProgress 
			phase={analysisPhase} 
			chunkProgress={chunkProgress} 
			retryMessage={retryMessage}
			subPhase={subPhase}
			onCancel={handleCancelAnalysis}
		/>

		{#if analysisResult}
			<AnalysisResults result={analysisResult} onDismiss={handleDismissAnalysis} />
		{/if}

		<!-- Memory Viewer -->
		<MemoryViewer autoExpand={memoryAutoExpand} />

		<!-- Advanced Settings and Memory Management -->
		<div class="mt-4 space-y-4">
			<AdvancedSettings 
				onPromptsChange={handlePromptsChange}
				onProviderChange={handleProviderChange}
			/>
			
			<!-- Memory Management -->
			<div class="bg-white rounded-lg shadow-sm p-4">
				<h3 class="text-sm font-medium text-gray-900 mb-2">Memory Management</h3>
				<p class="text-xs text-gray-600 mb-3">
					Analysis memory helps improve results by remembering patterns from previous sessions.
				</p>
				<button
					type="button"
					onclick={handleClearMemory}
					class="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-red-500"
				>
					Clear Memory
				</button>
			</div>
		</div>
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