<script lang="ts">
import { format, formatDistance, isSameDay } from "date-fns";
import type { ChunkInfo } from "../types";
import CollapsibleSection from "./CollapsibleSection.svelte";

type Props = {
	chunks: ChunkInfo[];
};

let { chunks = [] }: Props = $props();

function formatDateRange(start: Date, end: Date): string {
	if (isSameDay(start, end)) {
		return `${format(start, "PP")} (${format(start, "p")} - ${format(end, "p")})`;
	}
	return `${format(start, "PP p")} - ${format(end, "PP p")}`;
}

function getDuration(start: Date, end: Date): string {
	return formatDistance(start, end);
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
									{chunk.itemCount} items
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