<script lang="ts">
import { format, subDays, subHours, subWeeks } from "date-fns";
import { createEventDispatcher, onMount } from "svelte";
import { match } from "ts-pattern";
import { loadAIConfig } from "../utils/ai-config";
import type { AIProviderType } from "../utils/ai-interface";
import { loadMemory } from "../utils/memory";

let { isAnalyzing = $bindable(false), isAmbientAnalysisRunning = false } =
	$props<{
		isAnalyzing?: boolean;
		isAmbientAnalysisRunning?: boolean;
	}>();

const dispatch = createEventDispatcher();

let error = $state("");
type DateRange = "1hour" | "3hours" | "day" | "week" | "all";
let dateRange = $state<DateRange>("1hour");
let fetchProgress = $state(0);
let isFetching = $state(false);
let rawHistoryData = $state<chrome.history.HistoryItem[] | null>(null);
let showRawData = $state(false);
let currentProvider = $state<AIProviderType>("chrome");
let onlyNewHistory = $state(false);
let lastHistoryTimestamp = $state(0);

// Listen for storage changes to update provider
onMount(() => {
	// Load initial config
	loadAIConfig()
		.then((config) => {
			currentProvider = config.provider;
		})
		.catch((error) => {
			console.error("Failed to load AI config:", error);
			currentProvider = "chrome"; // fallback
		});

	// Load memory to get the last analyzed timestamp
	loadMemory()
		.then((memory) => {
			if (memory && memory.lastHistoryTimestamp > 0) {
				lastHistoryTimestamp = memory.lastHistoryTimestamp;
			}
		})
		.catch((error) => {
			console.error("Failed to load memory:", error);
		});

	// Listen for storage changes to update provider
	const storageListener = (changes: {
		[key: string]: chrome.storage.StorageChange;
	}) => {
		if (changes.ai_config) {
			const newConfig = changes.ai_config.newValue;
			if (newConfig?.provider) {
				currentProvider = newConfig.provider;
			}
		}
	};

	chrome.storage.onChanged.addListener(storageListener);

	// Cleanup
	return () => {
		chrome.storage.onChanged.removeListener(storageListener);
	};
});

function getPrivacyMessage(): string {
	switch (currentProvider) {
		case "chrome":
			return "Your browsing history never leaves your device. Analysis is performed using Chrome's built-in AI.";
		case "claude":
			return "⚠️ Using Claude API for development purposes. Your browsing history will be sent to Anthropic's servers for analysis.";
		default:
			return "Your browsing history will be processed according to the selected AI provider's privacy policy.";
	}
}

function getPrivacyColor(): string {
	switch (currentProvider) {
		case "chrome":
			return "bg-blue-50 text-blue-700";
		case "claude":
			return "bg-yellow-50 text-yellow-800";
		default:
			return "bg-gray-50 text-gray-700";
	}
}

function getStartTime(): number {
	if (onlyNewHistory && lastHistoryTimestamp > 0) {
		// Start from the timestamp of the last analyzed item + 1ms to avoid duplicates
		return lastHistoryTimestamp + 1;
	}

	const now = new Date();
	return match(dateRange)
		.with("1hour", () => subHours(now, 1).getTime())
		.with("3hours", () => subHours(now, 3).getTime())
		.with("day", () => subDays(now, 1).getTime())
		.with("week", () => subWeeks(now, 1).getTime())
		.with("all", () => 0)
		.exhaustive();
}

function getEndTime(): number {
	return Date.now();
}

async function fetchHistory() {
	if (isFetching || isAnalyzing || isAmbientAnalysisRunning) return;

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
			if (onlyNewHistory) {
				error = "No new browsing history found since last analysis.";
			} else {
				error = "No browsing history found for the selected date range.";
			}
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
					value="1hour"
					class="mr-2 text-blue-600 focus:ring-blue-500"
					disabled={isFetching || isAnalyzing}
				/>
				<span class="text-sm">1 hour</span>
			</label>
			<label class="flex items-center">
				<input
					type="radio"
					bind:group={dateRange}
					value="3hours"
					class="mr-2 text-blue-600 focus:ring-blue-500"
					disabled={isFetching || isAnalyzing}
				/>
				<span class="text-sm">3 hours</span>
			</label>
			<label class="flex items-center">
				<input
					type="radio"
					bind:group={dateRange}
					value="day"
					class="mr-2 text-blue-600 focus:ring-blue-500"
					disabled={isFetching || isAnalyzing}
				/>
				<span class="text-sm">24 hours</span>
			</label>
			<label class="flex items-center">
				<input
					type="radio"
					bind:group={dateRange}
					value="week"
					class="mr-2 text-blue-600 focus:ring-blue-500"
					disabled={isFetching || isAnalyzing}
				/>
				<span class="text-sm">7 days</span>
			</label>
			<label class="flex items-center">
				<input
					type="radio"
					bind:group={dateRange}
					value="all"
					class="mr-2 text-blue-600 focus:ring-blue-500"
					disabled={isFetching || isAnalyzing}
				/>
				<span class="text-sm">90 days</span>
			</label>
		</div>

	</div>

	{#if lastHistoryTimestamp > 0}
		<div class="flex items-center space-x-2">
			<input
				id="only-new-history"
				type="checkbox"
				bind:checked={onlyNewHistory}
				class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
				disabled={isFetching || isAnalyzing}
			/>
			<label for="only-new-history" class="text-sm text-gray-700">
				Only analyze new history since {format(new Date(lastHistoryTimestamp), 'PPpp')}
			</label>
		</div>
	{/if}

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
		disabled={isFetching || isAnalyzing || isAmbientAnalysisRunning}
		class="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
		title={isAmbientAnalysisRunning ? "Cannot run manual analysis while ambient analysis is in progress" : ""}
	>
		{#if isFetching}
			Fetching...
		{:else if isAnalyzing}
			Analyzing...
		{:else if isAmbientAnalysisRunning}
			Ambient Analysis Running...
		{:else}
			Analyze History Now
		{/if}
	</button>
	
	{#if error}
		<div class="bg-red-50 border border-red-200 rounded-lg p-3">
			<p class="text-sm text-red-800">{error}</p>
		</div>
	{/if}
	
	<div class={`${getPrivacyColor()} rounded-lg p-3`}>
		<p class="text-xs">
			{getPrivacyMessage()}
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