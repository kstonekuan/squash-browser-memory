<script lang="ts">
import type { AnalysisResult, WorkflowPattern } from "../types";
import ChunkDebugInfo from "./ChunkDebugInfo.svelte";
import ChunkDisplay from "./ChunkDisplay.svelte";

const { result } = $props<{ result: AnalysisResult }>();

let showRawAnalysis = $state(false);
let activeTab = $state<"profile" | "workflows">("profile");

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

function getTechLevelColor(level: string) {
	switch (level) {
		case "expert":
			return "bg-purple-100 text-purple-800";
		case "advanced":
			return "bg-blue-100 text-blue-800";
		case "intermediate":
			return "bg-green-100 text-green-800";
		case "beginner":
			return "bg-yellow-100 text-yellow-800";
		default:
			return "bg-gray-100 text-gray-800";
	}
}
</script>

<div class="space-y-6">
  <!-- Analysis Summary -->
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
  
  <!-- Tab Navigation -->
  <div class="bg-white rounded-lg shadow-md p-2">
    <div class="flex space-x-1">
      <button
        type="button"
        onclick={() => activeTab = 'profile'}
        class={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
          activeTab === 'profile' 
            ? 'bg-blue-500 text-white' 
            : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        User Profile
      </button>
      <button
        type="button"
        onclick={() => activeTab = 'workflows'}
        class={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
          activeTab === 'workflows' 
            ? 'bg-blue-500 text-white' 
            : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        Workflow Patterns
      </button>
    </div>
  </div>
  
  {#if activeTab === 'profile' && result.userProfile}
    <!-- User Profile Section -->
    <div class="bg-white rounded-lg shadow-md p-6">
      <h2 class="text-2xl font-semibold text-gray-900 mb-4">User Profile</h2>
      
      <!-- Profile Summary -->
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 class="text-lg font-semibold text-blue-900 mb-2">Profile Summary</h3>
        <p class="text-gray-700">{result.userProfile.summary}</p>
      </div>
      
      <!-- Profession -->
      <div class="mb-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-2">Likely Profession</h3>
        <p class="text-gray-700 bg-gray-50 rounded-lg p-3">{result.userProfile.profession}</p>
      </div>
      
      <!-- Interests -->
      <div class="mb-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-3">Interests & Hobbies</h3>
        <div class="flex flex-wrap gap-2">
          {#each result.userProfile.interests as interest}
            <span class="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm">
              {interest}
            </span>
          {/each}
        </div>
      </div>
      
      <!-- Work Patterns -->
      <div class="mb-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-3">Work Patterns</h3>
        <div class="space-y-3">
          {#each result.userProfile.workPatterns as pattern}
            <div class="border border-gray-200 rounded-lg p-3">
              <h4 class="font-medium text-gray-900">{pattern.type}</h4>
              <p class="text-sm text-gray-600 mt-1">{pattern.description}</p>
            </div>
          {/each}
        </div>
      </div>
      
      <!-- Personality Traits -->
      <div class="mb-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-3">Personality Insights</h3>
        <div class="space-y-3">
          {#each result.userProfile.personalityTraits as trait}
            <div class="bg-gray-50 rounded-lg p-3">
              <h4 class="font-medium text-gray-900">{trait.trait}</h4>
              <p class="text-sm text-gray-600 mt-1">{trait.evidence}</p>
            </div>
          {/each}
        </div>
      </div>
      
      <!-- Technology Proficiency -->
      <div class="mb-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-3">Technology Proficiency</h3>
        <div class="space-y-3">
          {#each result.userProfile.technologyUse as tech}
            <div class="border border-gray-200 rounded-lg p-3">
              <div class="flex justify-between items-start mb-2">
                <h4 class="font-medium text-gray-900">{tech.category}</h4>
                <span class={`px-2 py-1 text-xs font-medium rounded-full ${getTechLevelColor(tech.level)}`}>
                  {tech.level}
                </span>
              </div>
              <div class="flex flex-wrap gap-1 mt-2">
                {#each tech.tools as tool}
                  <span class="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                    {tool}
                  </span>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
  
  {#if activeTab === 'workflows'}
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
  {/if}
  
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