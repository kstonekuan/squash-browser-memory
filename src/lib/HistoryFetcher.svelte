<script lang="ts">
import { createEventDispatcher } from "svelte";

let { isAnalyzing = $bindable(false) } = $props<{
	isAnalyzing?: boolean;
}>();

const dispatch = createEventDispatcher();

let error = $state("");
let dateRange = $state("day"); // day, week, month, all
let customStartDate = $state("");
let customEndDate = $state("");
let fetchProgress = $state(0);
let isFetching = $state(false);
let rawHistoryData = $state<chrome.history.HistoryItem[] | null>(null);
let showRawData = $state(false);

function getStartTime(): number {
	const now = Date.now();
	switch (dateRange) {
		case "day":
			return now - 24 * 60 * 60 * 1000;
		case "week":
			return now - 7 * 24 * 60 * 60 * 1000;
		case "month":
			return now - 30 * 24 * 60 * 60 * 1000;
		case "custom":
			return customStartDate
				? new Date(customStartDate).getTime()
				: now - 24 * 60 * 60 * 1000;
		case "all":
		default:
			return 0;
	}
}

function getEndTime(): number {
	if (dateRange === "custom" && customEndDate) {
		return new Date(customEndDate).getTime();
	}
	return Date.now();
}

async function fetchHistory() {
	if (isFetching || isAnalyzing) return;

	error = "";
	isFetching = true;
	fetchProgress = 0;

	try {
		const startTime = getStartTime();
		const endTime = getEndTime();

		// Check if we're in an extension context
		if (!chrome?.history?.search) {
			throw new Error(
				"Chrome History API not available. Please make sure you're running this as a Chrome extension.",
			);
		}

		// Fetch history in batches for progress indication
		const maxResults = 5000;
		const results = await chrome.history.search({
			text: "",
			startTime,
			endTime,
			maxResults,
		});

		if (!results || results.length === 0) {
			error = "No browsing history found for the selected date range.";
			return;
		}

		// Store raw data for display
		rawHistoryData = results;

		// Emit the history data directly
		dispatch("analysis-request", {
			items: results,
		});
	} catch (err) {
		console.error("Failed to fetch history:", err);
		error =
			err instanceof Error ? err.message : "Failed to fetch browsing history";
	} finally {
		isFetching = false;
		fetchProgress = 100;
	}
}
</script>

<div class="space-y-4">
	<div>
		<h3 class="text-sm font-medium text-gray-700 mb-2">Date Range</h3>
		<div class="grid grid-cols-2 gap-2">
			<label class="flex items-center">
				<input
					type="radio"
					bind:group={dateRange}
					value="day"
					class="mr-2 text-blue-600 focus:ring-blue-500"
					disabled={isFetching || isAnalyzing}
				/>
				<span class="text-sm">Last 24 hours</span>
			</label>
			<label class="flex items-center">
				<input
					type="radio"
					bind:group={dateRange}
					value="week"
					class="mr-2 text-blue-600 focus:ring-blue-500"
					disabled={isFetching || isAnalyzing}
				/>
				<span class="text-sm">Last 7 days</span>
			</label>
			<label class="flex items-center">
				<input
					type="radio"
					bind:group={dateRange}
					value="month"
					class="mr-2 text-blue-600 focus:ring-blue-500"
					disabled={isFetching || isAnalyzing}
				/>
				<span class="text-sm">Last 30 days</span>
			</label>
			<label class="flex items-center">
				<input
					type="radio"
					bind:group={dateRange}
					value="all"
					class="mr-2 text-blue-600 focus:ring-blue-500"
					disabled={isFetching || isAnalyzing}
				/>
				<span class="text-sm">Last 90 days (Chrome limit)</span>
			</label>
			<label class="flex items-center col-span-2">
				<input
					type="radio"
					bind:group={dateRange}
					value="custom"
					class="mr-2 text-blue-600 focus:ring-blue-500"
					disabled={isFetching || isAnalyzing}
				/>
				<span class="text-sm">Custom range</span>
			</label>
		</div>

		{#if dateRange === "custom"}
			<div class="grid grid-cols-2 gap-2 mt-3">
				<div>
					<label for="start-date" class="block text-xs text-gray-600 mb-1">
						Start date
					</label>
					<input
						id="start-date"
						type="date"
						bind:value={customStartDate}
						class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
						disabled={isFetching || isAnalyzing}
					/>
				</div>
				<div>
					<label for="end-date" class="block text-xs text-gray-600 mb-1">
						End date
					</label>
					<input
						id="end-date"
						type="date"
						bind:value={customEndDate}
						class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
						disabled={isFetching || isAnalyzing}
					/>
				</div>
			</div>
		{/if}
	</div>

	{#if isFetching}
		<div class="space-y-1">
			<div class="flex justify-between text-sm text-gray-600">
				<span>Fetching history...</span>
				<span>{fetchProgress}%</span>
			</div>
			<div class="w-full bg-gray-200 rounded-full h-2">
				<div
					class="bg-blue-600 h-2 rounded-full transition-all duration-300"
					style="width: {fetchProgress}%"
				></div>
			</div>
		</div>
	{/if}

	<button
		onclick={fetchHistory}
		disabled={isFetching || isAnalyzing}
		class="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
	>
		{#if isFetching}
			Fetching...
		{:else if isAnalyzing}
			Analyzing...
		{:else}
			Analyze History
		{/if}
	</button>
	
	{#if error}
		<div class="bg-red-50 border border-red-200 rounded-lg p-3">
			<p class="text-sm text-red-800">{error}</p>
		</div>
	{/if}
	
	<div class="bg-blue-50 rounded-lg p-3">
		<p class="text-xs text-blue-700">
			Your browsing history never leaves your device. Analysis is performed using Chrome's built-in AI.
		</p>
	</div>
	
	{#if rawHistoryData && rawHistoryData.length > 0}
		<div class="border border-gray-200 rounded-lg">
			<button
				type="button"
				onclick={() => showRawData = !showRawData}
				class="w-full px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 flex items-center justify-between"
			>
				<span>Raw History Data ({rawHistoryData.length} items)</span>
				<svg 
					class={`w-5 h-5 transition-transform ${showRawData ? 'rotate-180' : ''}`} 
					fill="none" 
					stroke="currentColor" 
					viewBox="0 0 24 24"
				>
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
				</svg>
			</button>
			
			{#if showRawData}
				<div class="border-t border-gray-200">
					<div class="p-4 max-h-96 overflow-y-auto">
						<pre class="text-xs font-mono whitespace-pre-wrap break-words bg-gray-50 p-3 rounded">{JSON.stringify(rawHistoryData, null, 2)}</pre>
					</div>
					<div class="border-t border-gray-200 px-4 py-2 bg-gray-50">
						<p class="text-xs text-gray-600">
							This is the raw Chrome history data that will be sent to the AI model for analysis.
						</p>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>