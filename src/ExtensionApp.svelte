<script lang="ts">
import { setCustomPrompts } from "./config/llm";
import AdvancedSettings from "./lib/AdvancedSettings.svelte";
import ExtensionAIProviderInput from "./lib/ExtensionAIProviderInput.svelte";
import type { AnalysisPhase } from "./lib/AnalysisProgress.svelte";
import AnalysisProgress from "./lib/AnalysisProgress.svelte";
import AnalysisResults from "./lib/AnalysisResults.svelte";
import HistoryFetcher from "./lib/HistoryFetcher.svelte";
import type {
	AIProvider,
	AnalysisResult,
	StandardizedHistoryData,
} from "./types";
import {
	analyzeStandardizedData,
	parseToStandardFormat,
} from "./utils/analyzer";

let analysisResult: AnalysisResult | null = $state(null);
let standardizedData: StandardizedHistoryData | null = $state(null);
let isAnalyzing = $state(false);
let apiKey = $state("");
let provider: AIProvider = $state("gemini");
let analysisPhase: AnalysisPhase = $state("idle");

// Load saved API key and provider from chrome.storage
$effect(() => {
	if (chrome?.storage?.local) {
		chrome.storage.local.get(["apiKey", "provider"], (result) => {
			if (result.apiKey) apiKey = result.apiKey;
			if (result.provider) provider = result.provider;
		});
	}
});

async function handleAnalysis(
	event: CustomEvent<{ input: string; type: "text" | "json" }>,
) {
	const { input, type } = event.detail;

	if (!apiKey && provider !== 'chrome') {
		alert("Please enter your API key first.");
		return;
	}

	isAnalyzing = true;
	standardizedData = null;
	analysisResult = null;
	analysisPhase = "parsing";

	try {
		// Stage 1: Parse to standardized format
		const parsed = await parseToStandardFormat(input, apiKey, provider, type);

		// Stage 2: Calculate statistics (this happens synchronously in parseToStandardFormat)
		analysisPhase = "calculating";
		standardizedData = parsed;

		// Small delay to show the calculating phase
		await new Promise((resolve) => setTimeout(resolve, 300));

		// Stage 3: Analyze the standardized data
		analysisPhase = "analyzing";
		const result = await analyzeStandardizedData(parsed, apiKey, provider);
		analysisResult = result;

		analysisPhase = "complete";
	} catch (error) {
		console.error("Analysis error:", error);
		analysisPhase = "error";
		alert(error instanceof Error ? error.message : "Failed to analyze history");
	} finally {
		isAnalyzing = false;
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

function handlePromptsChange(prompts: { parsing: string; analysis: string }) {
	// Apply the custom prompts to the LLM config
	setCustomPrompts(prompts);
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
			<ExtensionAIProviderInput bind:apiKey bind:provider />

			<div class="mt-4 pt-4 border-t border-gray-200">
				<HistoryFetcher 
					bind:isAnalyzing 
					on:analysis-request={handleAnalysis}
				/>
			</div>
		</div>

		<AnalysisProgress phase={analysisPhase} />

		{#if analysisResult}
			<AnalysisResults result={analysisResult} />
		{/if}

		<!-- Advanced Settings at the bottom -->
		<div class="mt-4">
			<AdvancedSettings 
				{standardizedData}
				onPromptsChange={handlePromptsChange}
			/>
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