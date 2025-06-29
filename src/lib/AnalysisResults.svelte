<script lang="ts">
import type { AnalysisResult, WorkflowPattern } from "../types";

const { result } = $props<{ result: AnalysisResult }>();

let showRawAnalysis = $state(false);

function getAutomationColor(level: WorkflowPattern["automationPotential"]) {
	switch (level) {
		case "high":
			return "bg-green-100 text-green-800";
		case "medium":
			return "bg-yellow-100 text-yellow-800";
		case "low":
			return "bg-gray-100 text-gray-800";
	}
}
</script>

<div class="space-y-6">
  <div class="bg-white rounded-lg shadow-md p-6">
    <h2 class="text-2xl font-semibold text-gray-900 mb-4">Analysis Summary</h2>
    
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {#if result.totalUrls > 0}
        <div class="bg-gray-50 rounded-lg p-4">
          <p class="text-sm text-gray-600">Total URLs Analyzed</p>
          <p class="text-2xl font-bold text-gray-900">{result.totalUrls.toLocaleString()}</p>
        </div>
        
        <div class="bg-gray-50 rounded-lg p-4">
          <p class="text-sm text-gray-600">Date Range</p>
          <p class="text-sm font-medium text-gray-900">
            {result.dateRange.start.toLocaleDateString()} - {result.dateRange.end.toLocaleDateString()}
          </p>
        </div>
      {/if}
      
      <div class="bg-gray-50 rounded-lg p-4">
        <p class="text-sm text-gray-600">Patterns Found</p>
        <p class="text-2xl font-bold text-gray-900">{result.patterns.length}</p>
      </div>
    </div>
    
    {#if result.topDomains.length > 0}
      <div class="mb-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-3">Top Domains</h3>
        <div class="space-y-2">
          {#each result.topDomains.slice(0, 5) as domain}
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-700">{domain.domain}</span>
              <span class="text-sm font-medium text-gray-900">{domain.count} visits</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
  
  <div class="bg-white rounded-lg shadow-md p-6">
    <h2 class="text-2xl font-semibold text-gray-900 mb-4">Workflow Patterns</h2>
    
    <div class="space-y-4">
      {#each result.patterns as pattern}
        <div class="border border-gray-200 rounded-lg p-4">
          <div class="flex justify-between items-start mb-2">
            <h3 class="text-lg font-medium text-gray-900">{pattern.pattern}</h3>
            <span class={`px-2 py-1 text-xs font-medium rounded-full ${getAutomationColor(pattern.automationPotential)}`}>
              {pattern.automationPotential} automation potential
            </span>
          </div>
          
          <p class="text-gray-600 mb-3">{pattern.description}</p>
          
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
            <p class="text-sm font-medium text-blue-900 mb-1">Suggestion:</p>
            <p class="text-sm text-blue-800">{pattern.suggestion}</p>
          </div>
          
          <div class="flex items-center text-sm text-gray-500">
            <span>Frequency: {pattern.frequency} times</span>
            {#if pattern.timePattern}
              <span class="mx-2">•</span>
              <span>{pattern.timePattern}</span>
            {/if}
          </div>
          
          <details class="mt-3">
            <summary class="cursor-pointer text-sm text-blue-600 hover:text-blue-800">
              View example URLs ({pattern.urls.length})
            </summary>
            <ul class="mt-2 space-y-1">
              {#each pattern.urls.slice(0, 5) as url}
                <li class="text-xs text-gray-600 truncate">{url}</li>
              {/each}
              {#if pattern.urls.length > 5}
                <li class="text-xs text-gray-500">...and {pattern.urls.length - 5} more</li>
              {/if}
            </ul>
          </details>
        </div>
      {/each}
      
      {#if result.patterns.length === 0}
        <p class="text-gray-500 text-center py-8">
          No significant workflow patterns detected in your browsing history.
        </p>
      {/if}
    </div>
  </div>
  
  <!-- Raw Analysis Data Section -->
  <div class="bg-white rounded-lg shadow-md">
    <button
      type="button"
      onclick={() => showRawAnalysis = !showRawAnalysis}
      class="w-full px-6 py-4 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 flex items-center justify-between"
    >
      <span>Raw Analysis Output</span>
      <svg 
        class={`w-5 h-5 transition-transform ${showRawAnalysis ? 'rotate-180' : ''}`} 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
    
    {#if showRawAnalysis}
      <div class="border-t border-gray-200">
        <div class="p-4 max-h-96 overflow-y-auto">
          <pre class="text-xs font-mono whitespace-pre-wrap break-words bg-gray-50 p-3 rounded">{JSON.stringify(result, null, 2)}</pre>
        </div>
        <div class="border-t border-gray-200 px-6 py-3 bg-gray-50">
          <p class="text-xs text-gray-600">
            This is the raw analysis output from the AI model before being formatted for display.
          </p>
        </div>
      </div>
    {/if}
  </div>
</div>