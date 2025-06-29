<script lang="ts">
import { setCustomPrompts } from "./config/llm";
import AdvancedSettings from "./lib/AdvancedSettings.svelte";
import AIProviderInput from "./lib/AIProviderInput.svelte";
import type { AnalysisPhase } from "./lib/AnalysisProgress.svelte";
import AnalysisProgress from "./lib/AnalysisProgress.svelte";
import AnalysisResults from "./lib/AnalysisResults.svelte";
import HistoryInput from "./lib/HistoryInput.svelte";
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
let provider: AIProvider = $state("chrome");
let analysisPhase: AnalysisPhase = $state("idle");

async function handleAnalysis(
	event: CustomEvent<{ input: string; type: "text" | "json" }>,
) {
	const { input, type } = event.detail;

	if (!apiKey && provider !== "chrome") {
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
  <div class="container mx-auto px-4 py-12 max-w-6xl">
    <header class="text-center mb-12">
      <h1 class="text-4xl font-bold text-gray-900 mb-4">
        Chrome History Workflow Analyzer
      </h1>
      <p class="text-lg text-gray-600 max-w-2xl mx-auto">
        Upload or paste your Chrome history export and discover repetitive workflows that can be automated or optimized.
      </p>
    </header>

    <div class="bg-white rounded-lg shadow-md p-8 mb-8">
      <div class="mb-8">
        <h2 class="text-2xl font-semibold text-gray-900 mb-4">Privacy Notice</h2>
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p class="text-sm text-blue-800">
            Your browsing history is processed entirely in your browser. The data is only sent to the AI service for analysis and is not stored anywhere. We recommend using your own API key for maximum privacy.
          </p>
        </div>
      </div>

      <AIProviderInput bind:apiKey bind:provider />

      <HistoryInput 
        {apiKey}
        {provider}
        bind:isAnalyzing 
        on:analysis-request={handleAnalysis}
      />
    </div>

    <AnalysisProgress phase={analysisPhase} />

    {#if analysisResult}
      <AnalysisResults result={analysisResult} />
    {/if}

    <!-- Advanced Settings at the bottom -->
    <div class="mt-8">
      <AdvancedSettings 
        {standardizedData}
        onPromptsChange={handlePromptsChange}
      />
    </div>
  </div>
</main>