<script lang="ts">
import { format } from "date-fns";
import type { FullAnalysisResult, MemorySettings } from "../types";
import ChunkDebugInfo from "./ChunkDebugInfo.svelte";
import ChunkDisplay from "./ChunkDisplay.svelte";
import CollapsibleSection from "./CollapsibleSection.svelte";

type Props = {
	result: FullAnalysisResult;
	onDismiss: () => void;
	memorySettings?: MemorySettings;
};

let { result, onDismiss, memorySettings }: Props = $props();
</script>

<CollapsibleSection 
  title="Last Analysis Raw Results" 
  defaultOpen={false}
  badge="Complete"
  badgeColor="green"
  class="mb-8"
>
  <div class="space-y-4 p-4">
    <!-- Analysis Summary -->
    <div class="bg-gray-50 rounded-lg p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-md font-semibold text-gray-900">Summary</h3>
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
      {#if result.stats.totalUrls > 0}
        <div class="flex items-center space-x-1">
          <span class="text-gray-600">URLs:</span>
          <span class="font-medium text-gray-900">{result.stats.totalUrls.toLocaleString()}</span>
        </div>
        
        <div class="flex items-center space-x-1">
          <span class="text-gray-600">Period:</span>
          <span class="font-medium text-gray-900">
            {format(result.stats.dateRange.start, "PP")} - {format(result.stats.dateRange.end, "PP")}
          </span>
        </div>
      {/if}
      
      {#if memorySettings?.storeWorkflowPatterns !== false}
        <div class="flex items-center space-x-1">
          <span class="text-gray-600">Patterns:</span>
          <span class="font-medium text-gray-900">{result.memory.patterns.length}</span>
        </div>
      {/if}
      
      {#if result.stats.topDomains.length > 0}
        <div class="flex items-center space-x-1">
          <span class="text-gray-600">Top domain:</span>
          <span class="font-medium text-gray-900">{result.stats.topDomains[0].domain}</span>
        </div>
      {/if}
    </div>
    
    <div class="mt-3 text-xs text-green-600 bg-green-50 rounded px-2 py-1 inline-block">
      ✓ Memory updated with new insights
    </div>
  </div>
  
  <!-- Chunks Display Section -->
  <ChunkDisplay chunks={result.chunks} />
  
  <!-- Chunking Debug Info -->
  <ChunkDebugInfo rawResponse={result.chunkingResult.rawResponse} error={result.chunkingResult.error} />
  
  <!-- Raw Analysis Data Section -->
  <CollapsibleSection title="Raw Analysis Output" class="bg-white shadow-md">
        <div class="p-3 max-h-80 overflow-y-auto">
          <pre class="text-xs font-mono whitespace-pre-wrap break-words bg-gray-50 p-3 rounded">{JSON.stringify(result, null, 2)}</pre>
        </div>
        <div class="border-t border-gray-200 px-4 py-2 bg-gray-50">
          <p class="text-xs text-gray-600">
            Raw analysis output from the AI model.
          </p>
        </div>
    </CollapsibleSection>
  </div>
</CollapsibleSection>