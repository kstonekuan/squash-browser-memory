<script lang="ts">
import type { AnalysisResult } from "../types";
import ChunkDebugInfo from "./ChunkDebugInfo.svelte";
import ChunkDisplay from "./ChunkDisplay.svelte";

const { result, onDismiss } = $props<{
	result: AnalysisResult;
	onDismiss: () => void;
}>();

let showRawAnalysis = $state(false);
</script>

<div class="space-y-4 mb-8">
  <!-- Analysis Summary -->
  <div class="bg-white rounded-lg shadow-md p-4">
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-lg font-semibold text-gray-900">Analysis Complete</h2>
      <button
        type="button"
        onclick={onDismiss}
        class="p-1 text-gray-400 hover:text-gray-600 transition-colors"
        title="Dismiss"
        aria-label="Dismiss analysis results"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
    
    <div class="flex flex-wrap gap-4 text-sm">
      {#if result.totalUrls > 0}
        <div class="flex items-center space-x-1">
          <span class="text-gray-600">URLs:</span>
          <span class="font-medium text-gray-900">{result.totalUrls.toLocaleString()}</span>
        </div>
        
        <div class="flex items-center space-x-1">
          <span class="text-gray-600">Period:</span>
          <span class="font-medium text-gray-900">
            {result.dateRange.start.toLocaleDateString()} - {result.dateRange.end.toLocaleDateString()}
          </span>
        </div>
      {/if}
      
      <div class="flex items-center space-x-1">
        <span class="text-gray-600">Patterns:</span>
        <span class="font-medium text-gray-900">{result.patterns.length}</span>
      </div>
      
      {#if result.topDomains.length > 0}
        <div class="flex items-center space-x-1">
          <span class="text-gray-600">Top domain:</span>
          <span class="font-medium text-gray-900">{result.topDomains[0].domain}</span>
        </div>
      {/if}
    </div>
    
    <div class="mt-3 text-xs text-green-600 bg-green-50 rounded px-2 py-1 inline-block">
      ✓ Memory updated with new insights
    </div>
  </div>
  
  <!-- Chunks Display Section -->
  {#if result.chunks}
    <ChunkDisplay chunks={result.chunks} />
  {/if}
  
  <!-- Chunking Debug Info -->
  <ChunkDebugInfo rawResponse={result.chunkingRawResponse} error={result.chunkingError} />
  
  <!-- Raw Analysis Data Section -->
  <div class="bg-white rounded-lg shadow-md">
    <button
      type="button"
      onclick={() => showRawAnalysis = !showRawAnalysis}
      class="w-full px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 flex items-center justify-between"
    >
      <span>Raw Analysis Output</span>
      <svg 
        class={`w-4 h-4 transition-transform ${showRawAnalysis ? 'rotate-180' : ''}`} 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
    
    {#if showRawAnalysis}
      <div class="border-t border-gray-200">
        <div class="p-3 max-h-80 overflow-y-auto">
          <pre class="text-xs font-mono whitespace-pre-wrap break-words bg-gray-50 p-3 rounded">{JSON.stringify(result, null, 2)}</pre>
        </div>
        <div class="border-t border-gray-200 px-4 py-2 bg-gray-50">
          <p class="text-xs text-gray-600">
            Raw analysis output from the AI model.
          </p>
        </div>
      </div>
    {/if}
  </div>
</div>