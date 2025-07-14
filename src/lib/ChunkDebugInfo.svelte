<script lang="ts">
import CollapsibleSection from "./CollapsibleSection.svelte";

type Props = {
	rawResponse?: string;
	error?: string;
};

let { rawResponse = "", error = "" }: Props = $props();

function formatJson(json: string): string {
	try {
		const parsed = JSON.parse(json);
		return JSON.stringify(parsed, null, 2);
	} catch {
		return json;
	}
}
</script>

<CollapsibleSection 
	title="Chunking Debug Info"
	badge={error ? "Error" : rawResponse ? "Debug" : "Success"}
	badgeColor={error ? "red" : rawResponse ? "yellow" : "green"}
	class="bg-white shadow-md"
>
			<div class="p-4 space-y-3">
				{#if error}
					<div class="bg-red-50 border border-red-200 rounded-md p-3">
						<h4 class="text-sm font-semibold text-red-900 mb-1">Error:</h4>
						<p class="text-sm text-red-700">{error}</p>
					</div>
				{:else if rawResponse}
					<div>
						<h4 class="text-sm font-semibold text-gray-900 mb-2">Raw LLM Response:</h4>
						<pre class="bg-gray-50 rounded-md p-3 text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap break-words">{formatJson(rawResponse)}</pre>
					</div>
				{:else}
					<div class="bg-green-50 border border-green-200 rounded-md p-3">
						<p class="text-sm text-green-700">
							✓ Chunking succeeded on first try - no retries needed
						</p>
					</div>
				{/if}
			</div>
</CollapsibleSection>