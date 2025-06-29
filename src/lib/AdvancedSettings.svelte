<script lang="ts">
// Default prompts for Chrome AI
const DEFAULT_ANALYSIS_PROMPT = `You are an expert at analyzing browsing patterns and identifying repetitive workflows. 

When analyzing browsing history:
1. Look for patterns where users visit the same sequence of sites repeatedly
2. Identify time-based routines (daily, weekly, etc.)
3. Find workflows that could be automated or optimized
4. Focus on actionable insights

For each pattern found, provide:
- A clear, descriptive name for the workflow
- A detailed description of what the user is doing
- The frequency of occurrence
- Example URLs that are part of this workflow
- Time patterns if applicable (e.g., "Every weekday morning")
- A practical suggestion for automation or optimization
- An assessment of automation potential (high/medium/low)`;

let { onPromptsChange } = $props<{
	onPromptsChange?: (prompts: { parsing: string; analysis: string }) => void;
}>();

let showPrompts = $state(false);
let editableAnalysisPrompt = $state(DEFAULT_ANALYSIS_PROMPT);

function handlePromptChange() {
	onPromptsChange?.({
		parsing: "", // Not used anymore
		analysis: editableAnalysisPrompt,
	});
}

function resetPrompts() {
	editableAnalysisPrompt = DEFAULT_ANALYSIS_PROMPT;
	handlePromptChange();
}
</script>

<div class="space-y-4">
	<!-- Prompt Customization Section -->
	<div class="border border-gray-200 rounded-lg">
		<button
			type="button"
			onclick={() => showPrompts = !showPrompts}
			class="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors rounded-t-lg"
		>
			<span class="font-medium text-gray-700">Customize AI Prompts</span>
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
			<div class="p-4 border-t border-gray-200">
				<div class="space-y-4">
					<div>
						<label for="analysis-prompt" class="block text-sm font-medium text-gray-700 mb-2">
							Analysis Prompt
						</label>
						<textarea
							id="analysis-prompt"
							bind:value={editableAnalysisPrompt}
							oninput={handlePromptChange}
							rows="8"
							class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
							placeholder="Enter custom analysis prompt..."
						></textarea>
						<p class="mt-1 text-xs text-gray-500">
							This prompt is used when analyzing browsing patterns to identify workflows.
						</p>
					</div>
					
					<div class="flex justify-end">
						<button
							onclick={resetPrompts}
							class="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
						>
							Reset to defaults
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>