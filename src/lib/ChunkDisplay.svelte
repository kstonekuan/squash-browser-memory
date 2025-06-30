<script lang="ts">
import type { ChunkInfo } from "../types";
import CollapsibleSection from "./CollapsibleSection.svelte";

let { chunks = [] } = $props<{ chunks: ChunkInfo[] }>();

function formatDateRange(start: Date, end: Date): string {
	const sameDay = start.toDateString() === end.toDateString();
	if (sameDay) {
		return `${start.toLocaleDateString()} (${start.toLocaleTimeString()} - ${end.toLocaleTimeString()})`;
	}
	return `${start.toLocaleDateString()} ${start.toLocaleTimeString()} - ${end.toLocaleDateString()} ${end.toLocaleTimeString()}`;
}

function getDuration(start: Date, end: Date): string {
	const diff = end.getTime() - start.getTime();
	const hours = Math.floor(diff / (1000 * 60 * 60));
	const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	return `${minutes}m`;
}
</script>

<CollapsibleSection 
	title={`Analysis Chunks (${chunks.length} sessions${chunks.some((c: ChunkInfo) => c.isFallback) ? ' - Fallback Used' : ''})`}
	class="bg-white shadow-md"
>
			<div class="p-4">
				{#if chunks.length === 0}
					<p class="text-sm text-gray-500">No chunks were generated for this analysis.</p>
				{:else}
					<div class="space-y-3">
						{#each chunks as chunk, index}
							<div class="border border-gray-200 rounded-lg p-3">
								<div class="flex justify-between items-start mb-2">
									<h4 class="text-sm font-medium text-gray-900">
										Session {index + 1}{chunk.isFallback ? ' (Fallback)' : ''}
									</h4>
									<span class="text-xs text-gray-500">
										{getDuration(chunk.startTime, chunk.endTime)}
									</span>
								</div>
								<p class="text-xs text-gray-600 mb-1">
									{formatDateRange(chunk.startTime, chunk.endTime)}
								</p>
								<p class="text-xs text-gray-500">
									{chunk.itemCount} items • {chunk.description}
								</p>
							</div>
						{/each}
					</div>
				{/if}
			</div>
			<div class="border-t border-gray-200 px-6 py-3 bg-gray-50">
				<p class="text-xs text-gray-600">
					{chunks.some((c: ChunkInfo) => c.isFallback) 
						? 'AI chunking was not available or did not produce valid results. History was grouped into half-day sessions (12am-12pm and 12pm-12am) as a fallback.'
						: 'Browsing history was intelligently grouped into sessions for more accurate analysis. Each session represents a cohesive period of activity.'}
				</p>
			</div>
</CollapsibleSection>