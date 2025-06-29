<script lang="ts">
let { rawResponse = "", error = "" } = $props<{
	rawResponse?: string;
	error?: string;
}>();

let showDebug = $state(false);

function formatJson(json: string): string {
	try {
		const parsed = JSON.parse(json);
		return JSON.stringify(parsed, null, 2);
	} catch {
		return json;
	}
}
</script>

{#if (rawResponse || error)}
<div class="bg-white rounded-lg shadow-md">
	<button
		type="button"
		onclick={() => showDebug = !showDebug}
		class="w-full px-6 py-4 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 flex items-center justify-between"
	>
		<span>Chunking Debug Info {error ? '(Error)' : ''}</span>
		<svg 
			class={`w-5 h-5 transition-transform ${showDebug ? 'rotate-180' : ''}`} 
			fill="none" 
			stroke="currentColor" 
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>
	
	{#if showDebug}
		<div class="border-t border-gray-200">
			<div class="p-4 space-y-3">
				{#if error}
					<div class="bg-red-50 border border-red-200 rounded-md p-3">
						<h4 class="text-sm font-semibold text-red-900 mb-1">Error:</h4>
						<p class="text-sm text-red-700">{error}</p>
					</div>
				{/if}
				
				{#if rawResponse}
					<div>
						<h4 class="text-sm font-semibold text-gray-900 mb-2">Raw LLM Response:</h4>
						<pre class="bg-gray-50 rounded-md p-3 text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap break-words">{formatJson(rawResponse)}</pre>
					</div>
				{:else if !error}
					<p class="text-sm text-gray-500 italic">No raw response available (chunking succeeded on first try)</p>
				{/if}
			</div>
		</div>
	{/if}
</div>
{/if}