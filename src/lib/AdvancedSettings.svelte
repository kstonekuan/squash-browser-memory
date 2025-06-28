<script lang="ts">
import {
	DEFAULT_ANALYSIS_PROMPT,
	DEFAULT_PARSING_PROMPT,
	resetPrompts,
	setCustomPrompts,
} from "../config/llm";
import type { StandardizedHistoryData } from "../types";

let { standardizedData = null, onPromptsChange } = $props<{
	standardizedData: StandardizedHistoryData | null;
	onPromptsChange?: (prompts: { parsing: string; analysis: string }) => void;
}>();

let showStandardFormat = $state(false);
let showPrompts = $state(false);
let editableParsingPrompt = $state(DEFAULT_PARSING_PROMPT);
let editableAnalysisPrompt = $state(DEFAULT_ANALYSIS_PROMPT);

function handlePromptChange() {
	onPromptsChange?.({
		parsing: editableParsingPrompt,
		analysis: editableAnalysisPrompt,
	});
}
</script>

<div class="space-y-4">
	<!-- Standardized Format Section -->
	{#if standardizedData}
		<div class="border border-gray-200 rounded-lg">
			<button
				type="button"
				onclick={() => showStandardFormat = !showStandardFormat}
				class="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors rounded-t-lg"
			>
				<span class="font-medium text-gray-700">Intermediate Standardized Format</span>
				<svg 
					class={`w-5 h-5 text-gray-500 transition-transform ${showStandardFormat ? 'rotate-180' : ''}`}
					fill="none" 
					stroke="currentColor" 
					viewBox="0 0 24 24"
				>
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
				</svg>
			</button>
			
			{#if showStandardFormat}
				<div class="p-4 border-t border-gray-200">
					<div class="space-y-4">
						<div>
							<h4 class="text-sm font-medium text-gray-700 mb-2">Statistics</h4>
							<dl class="grid grid-cols-1 sm:grid-cols-3 gap-4">
								<div class="bg-gray-50 p-3 rounded">
									<dt class="text-xs text-gray-500">Total URLs</dt>
									<dd class="text-lg font-semibold">{standardizedData.totalUrls}</dd>
								</div>
								<div class="bg-gray-50 p-3 rounded">
									<dt class="text-xs text-gray-500">Date Range</dt>
									<dd class="text-sm">
										{new Date(standardizedData.dateRange.start).toLocaleDateString()} - 
										{new Date(standardizedData.dateRange.end).toLocaleDateString()}
									</dd>
								</div>
								<div class="bg-gray-50 p-3 rounded">
									<dt class="text-xs text-gray-500">Unique Domains</dt>
									<dd class="text-lg font-semibold">{standardizedData.topDomains.length}</dd>
								</div>
							</dl>
						</div>
						
						<div>
							<h4 class="text-sm font-medium text-gray-700 mb-2">Top Domains</h4>
							<div class="bg-gray-50 rounded p-3 max-h-32 overflow-y-auto">
								{#each standardizedData.topDomains as domain}
									<div class="flex justify-between py-1">
										<span class="text-sm">{domain.domain}</span>
										<span class="text-sm text-gray-600">{domain.count} visits</span>
									</div>
								{/each}
							</div>
						</div>
						
						<div>
							<h4 class="text-sm font-medium text-gray-700 mb-2">Raw Standardized Data</h4>
							<pre class="bg-gray-50 rounded p-3 text-xs overflow-x-auto max-h-64 overflow-y-auto">{JSON.stringify(standardizedData, null, 2)}</pre>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Prompts Section -->
	<div class="border border-gray-200 rounded-lg">
		<button
			type="button"
			onclick={() => showPrompts = !showPrompts}
			class="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors rounded-t-lg"
		>
			<span class="font-medium text-gray-700">Customize Prompts</span>
			<svg 
				class={`w-5 h-5 text-gray-500 transition-transform ${showPrompts ? 'rotate-180' : ''}`}
				fill="none" 
				stroke="currentColor" 
				viewBox="0 0 24 24"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>
		
		{#if showPrompts}
			<div class="p-4 border-t border-gray-200 space-y-4">
				<div>
					<label for="parsing-prompt" class="block text-sm font-medium text-gray-700 mb-2">
						Parsing Prompt (Stage 1)
					</label>
					<textarea
						id="parsing-prompt"
						bind:value={editableParsingPrompt}
						onchange={handlePromptChange}
						class="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					></textarea>
				</div>
				
				<div>
					<label for="analysis-prompt" class="block text-sm font-medium text-gray-700 mb-2">
						Analysis Prompt (Stage 2)
					</label>
					<textarea
						id="analysis-prompt"
						bind:value={editableAnalysisPrompt}
						onchange={handlePromptChange}
						class="w-full h-48 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					></textarea>
				</div>
				
				<button
					type="button"
					onclick={() => {
						editableParsingPrompt = DEFAULT_PARSING_PROMPT;
						editableAnalysisPrompt = DEFAULT_ANALYSIS_PROMPT;
						handlePromptChange();
					}}
					class="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
				>
					Reset to Defaults
				</button>
			</div>
		{/if}
	</div>
</div>