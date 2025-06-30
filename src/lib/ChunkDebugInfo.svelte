<script lang="ts">
import CollapsibleSection from "./CollapsibleSection.svelte";

let { rawResponse = "", error = "" } = $props<{
	rawResponse?: string;
	error?: string;
}>();

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
<CollapsibleSection 
	title="Chunking Debug Info"
	badge={error ? "Error" : ""}
	badgeColor={error ? "red" : "gray"}
	class="bg-white shadow-md"
>
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
</CollapsibleSection>
{/if}