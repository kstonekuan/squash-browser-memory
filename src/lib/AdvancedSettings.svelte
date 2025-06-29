<script lang="ts">
import {
	DEFAULT_CHUNK_SYSTEM_PROMPT,
	DEFAULT_SYSTEM_PROMPT,
} from "../utils/constants";
import { ANALYSIS_SCHEMA, CHUNK_SCHEMA } from "../utils/schemas";

let { onPromptsChange } = $props<{
	onPromptsChange?: (prompts: { system: string; chunk: string }) => void;
}>();

let showPrompts = $state(false);
let editableSystemPrompt = $state(DEFAULT_SYSTEM_PROMPT);
let editableChunkPrompt = $state(DEFAULT_CHUNK_SYSTEM_PROMPT);
let showAnalysisSchema = $state(false);
let showChunkSchema = $state(false);

function handlePromptChange() {
	onPromptsChange?.({
		system: editableSystemPrompt,
		chunk: editableChunkPrompt,
	});
}

function resetPrompts() {
	editableSystemPrompt = DEFAULT_SYSTEM_PROMPT;
	editableChunkPrompt = DEFAULT_CHUNK_SYSTEM_PROMPT;
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
					<!-- System Prompt -->
					<div>
						<div class="flex items-center justify-between mb-2">
							<label for="system-prompt" class="block text-sm font-medium text-gray-700">
								Analysis System Prompt
							</label>
							<button
								type="button"
								onclick={() => showAnalysisSchema = !showAnalysisSchema}
								class="text-xs text-blue-600 hover:text-blue-800"
							>
								{showAnalysisSchema ? 'Hide' : 'Show'} Expected Output Schema
							</button>
						</div>
						<textarea
							id="system-prompt"
							bind:value={editableSystemPrompt}
							oninput={handlePromptChange}
							rows="4"
							class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
							placeholder="Enter custom system prompt..."
						></textarea>
						<p class="mt-1 text-xs text-gray-500">
							This prompt guides the AI when analyzing browsing patterns to identify workflows and create user profiles.
						</p>
						{#if showAnalysisSchema}
							<div class="mt-2 p-3 bg-gray-100 rounded-md">
								<p class="text-xs font-medium text-gray-700 mb-1">Expected Output Schema:</p>
								<pre class="text-xs text-gray-600 overflow-x-auto">{JSON.stringify(ANALYSIS_SCHEMA, null, 2)}</pre>
							</div>
						{/if}
					</div>
					
					<!-- Chunk Prompt -->
					<div>
						<div class="flex items-center justify-between mb-2">
							<label for="chunk-prompt" class="block text-sm font-medium text-gray-700">
								Chunking System Prompt
							</label>
							<button
								type="button"
								onclick={() => showChunkSchema = !showChunkSchema}
								class="text-xs text-blue-600 hover:text-blue-800"
							>
								{showChunkSchema ? 'Hide' : 'Show'} Expected Output Schema
							</button>
						</div>
						<textarea
							id="chunk-prompt"
							bind:value={editableChunkPrompt}
							oninput={handlePromptChange}
							rows="4"
							class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
							placeholder="Enter custom chunking prompt..."
						></textarea>
						<p class="mt-1 text-xs text-gray-500">
							This prompt guides the AI when identifying natural browsing sessions from timestamps.
						</p>
						{#if showChunkSchema}
							<div class="mt-2 p-3 bg-gray-100 rounded-md">
								<p class="text-xs font-medium text-gray-700 mb-1">Expected Output Schema:</p>
								<pre class="text-xs text-gray-600 overflow-x-auto">{JSON.stringify(CHUNK_SCHEMA, null, 2)}</pre>
							</div>
						{/if}
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