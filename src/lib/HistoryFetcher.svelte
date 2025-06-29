<script lang="ts">
import { createEventDispatcher } from "svelte";
import type { ChromeHistoryItem } from "../types";

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

		// Convert to our ChromeHistoryItem format
		const historyItems: ChromeHistoryItem[] = results
			.filter((item) => item.url && item.lastVisitTime)
			.map((item) => ({
				id: item.id || "",
				url: item.url || "",
				title: item.title || "",
				lastVisitTime: new Date(item.lastVisitTime || 0).toISOString(),
				visitCount: item.visitCount || 1,
				typedCount: item.typedCount || 0,
			}));

		// Emit the history data as JSON
		dispatch("analysis-request", {
			input: JSON.stringify(historyItems),
			type: "json",
		});
	} catch (err) {
		console.error("Failed to fetch history:", err);
		error =
			err instanceof Error ? err.message : "Failed to fetch browsing history";
	} finally {
		isFetching = false;
		fetchProgress = 0;
	}
}

function formatDateForInput(date: Date): string {
	return date.toISOString().split("T")[0];
}

// Set default custom dates
$effect(() => {
	if (!customStartDate) {
		customStartDate = formatDateForInput(
			new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
		);
	}
	if (!customEndDate) {
		customEndDate = formatDateForInput(new Date());
	}
});
</script>

<div class="space-y-4">
	<div>
		<p class="block text-sm font-medium text-gray-700 mb-2">
			Select Date Range
		</p>
		<div class="space-y-2">
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
				<span class="text-sm">All time</span>
			</label>
			<label class="flex items-center">
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
			<div class="mt-3 space-y-2 pl-6">
				<div>
					<label for="start-date" class="block text-xs text-gray-600">Start date</label>
					<input
						id="start-date"
						type="date"
						bind:value={customStartDate}
						max={customEndDate}
						class="mt-1 block w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
						disabled={isFetching || isAnalyzing}
					/>
				</div>
				<div>
					<label for="end-date" class="block text-xs text-gray-600">End date</label>
					<input
						id="end-date"
						type="date"
						bind:value={customEndDate}
						min={customStartDate}
						max={formatDateForInput(new Date())}
						class="mt-1 block w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
						disabled={isFetching || isAnalyzing}
					/>
				</div>
			</div>
		{/if}
	</div>
	
	<button
		type="button"
		onclick={fetchHistory}
		disabled={isFetching || isAnalyzing}
		class="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
	>
		{#if isFetching}
			<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
			Fetching history...
		{:else}
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
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
			Your browsing history never leaves your device. Analysis is performed using your API key.
		</p>
	</div>
</div>