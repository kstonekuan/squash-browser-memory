<script lang="ts">
import { format, formatDistanceToNow } from "date-fns";
import {
	ambientSettings,
	toggleAmbientAnalysis as toggleAmbient,
} from "../stores/ambient-store";
import { sidepanelToBackgroundClient } from "../trpc/client";
import type { AutoAnalysisSettings } from "../utils/ambient";

let { analysisStatus = { status: "idle" }, aiStatus = "unavailable" } = $props<{
	analysisStatus?: {
		status: "idle" | "running" | "completed" | "skipped" | "error";
		message?: string;
		itemCount?: number;
		reason?: string;
	};
	aiStatus?:
		| "available"
		| "unavailable"
		| "needs-configuration"
		| "rate-limited"
		| "error";
}>();

let settings = $state<AutoAnalysisSettings>({
	enabled: false,
	notifyOnSuccess: true,
	notifyOnError: true,
});
let loading = $state(false);
let toggling = $state(false);

// Subscribe to the store
$effect(() => {
	const unsubscribe = ambientSettings.subscribe((value) => {
		settings = value;
	});

	return unsubscribe;
});

// Query actual alarm time on mount and when enabled
let lastQueriedEnabled = false;
$effect(() => {
	// Only query if we're transitioning from disabled to enabled or on first mount
	if (settings.enabled && !lastQueriedEnabled) {
		sidepanelToBackgroundClient.ambient.queryNextAlarm
			.query()
			.then((response) => {
				if (response?.nextRunTime) {
					ambientSettings.update((s) => ({
						...s,
						nextAlarmTime: response.nextRunTime,
					}));
				}
			})
			.catch(() => {
				// Ignore errors - background might not be ready
			});
	}
	lastQueriedEnabled = settings.enabled;
});

async function toggleAmbientAnalysis() {
	toggling = true;
	try {
		await toggleAmbient();
	} catch (error) {
		console.error("Failed to toggle ambient analysis:", error);
		alert("Failed to update ambient analysis settings");
	} finally {
		toggling = false;
	}
}

function formatLastRunTime(): string {
	if (!settings.lastRunTimestamp) {
		return "Never";
	}

	const date = new Date(settings.lastRunTimestamp);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();

	// For very recent times (less than a minute), show "Just now"
	if (diffMs < 60000) {
		return "Just now";
	}

	// For times within the last 24 hours, use formatDistanceToNow
	if (diffMs < 24 * 60 * 60 * 1000) {
		return formatDistanceToNow(date, { addSuffix: true });
	}

	// For older times, show the date
	return format(date, "PP");
}

function getStatusIcon() {
	if (loading) return "⏳";
	if (analysisStatus.status === "running") return "🔄";
	if (analysisStatus.status === "completed") return "✨";
	if (analysisStatus.status === "skipped") return "⏭️";
	if (analysisStatus.status === "error" || settings.lastRunStatus === "error")
		return "❌";
	if (settings.enabled) return "✅";
	return "⏸️";
}

function getStatusColor() {
	if (analysisStatus.status === "running")
		return "text-blue-600 bg-blue-50 animate-pulse";
	if (analysisStatus.status === "completed")
		return "text-green-600 bg-green-50";
	if (analysisStatus.status === "skipped")
		return "text-yellow-600 bg-yellow-50";
	if (analysisStatus.status === "error" || settings.lastRunStatus === "error")
		return "text-red-600 bg-red-50";
	if (settings.enabled) return "text-blue-600 bg-blue-50";
	return "text-gray-600 bg-gray-50";
}

function getNextAnalysisTime(): string {
	// If we have the actual alarm time, use it
	if (settings.nextAlarmTime) {
		return format(new Date(settings.nextAlarmTime), "p");
	}

	// Otherwise, estimate based on last run
	if (!settings.lastRunTimestamp) {
		// First run will be in 1 minute
		const nextTime = new Date(Date.now() + 60000);
		return format(nextTime, "p");
	} else {
		// Calculate next hourly run
		const lastRun = new Date(settings.lastRunTimestamp);
		const nextRun = new Date(lastRun.getTime() + 3600000); // Add 1 hour

		// If next run is in the past, calculate the next future slot
		let nextTime = nextRun;
		while (nextTime.getTime() <= Date.now()) {
			nextTime = new Date(nextTime.getTime() + 3600000);
		}

		return format(nextTime, "p");
	}
}
</script>

<div class="bg-white rounded-lg shadow-sm p-4 mb-4">
	<div class="flex items-center justify-between">
		<div class="flex-1">
			<div class="flex items-center gap-2 mb-2">
				<h3 class="text-lg font-semibold text-gray-900">
					Ambient Analysis
				</h3>
				{#if settings.enabled}
					<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
						Active
					</span>
				{:else}
					<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
						Inactive
					</span>
				{/if}
			</div>
			
			<p class="text-xs text-gray-600 mb-2">
				Automatically analyze browsing events every hour to discover patterns.
			</p>

			{#if settings.lastRunTimestamp}
				<div class="flex items-center gap-4 text-xs text-gray-500">
					<span>
						<strong>Last run:</strong> {formatLastRunTime()}
					</span>
					{#if settings.lastRunStatus}
						<span class={settings.lastRunStatus === "success" ? "text-green-600" : "text-red-600"}>
							{settings.lastRunStatus === "success" ? "✓ Success" : "✗ Failed"}
						</span>
					{/if}
				</div>
				{#if settings.lastRunError}
					<p class="mt-1 text-xs text-red-600">
						Error: {settings.lastRunError}
					</p>
				{/if}
			{/if}
		</div>

		<div class="ml-4 flex flex-col items-end gap-2">
			<button
				onclick={toggleAmbientAnalysis}
				disabled={loading || toggling || aiStatus !== 'available'}
				title={aiStatus !== 'available' ? 'AI must be available to enable ambient analysis' : ''}
				class={`
					relative inline-flex h-8 w-14 items-center rounded-full transition-colors
					${settings.enabled ? "bg-blue-600" : "bg-gray-200"}
					${loading || toggling || aiStatus !== 'available' ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
				`}
			>
				<span class="sr-only">Enable ambient analysis</span>
				<span
					class={`
						inline-block h-6 w-6 transform rounded-full bg-white transition-transform shadow-sm
						${settings.enabled ? "translate-x-7" : "translate-x-1"}
					`}
				></span>
			</button>

			{#if settings.enabled}
				<button
					type="button"
					onclick={() => {
						// Find the auto-analysis settings section
						const autoAnalysisButton = document.querySelector('[data-settings-section="auto-analysis"]') as HTMLElement;
						if (autoAnalysisButton) {
							// First, ensure the button is visible by scrolling to it
							autoAnalysisButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
							
							// Wait a bit for scroll to complete, then click if it's not already open
							setTimeout(() => {
								const isExpanded = autoAnalysisButton.parentElement?.querySelector('[class*="rotate-180"]');
								if (!isExpanded) {
									autoAnalysisButton.click();
								}
							}, 300);
						}
					}}
					class="text-xs text-blue-600 hover:text-blue-800 hover:underline"
				>
					Settings →
				</button>
			{/if}
		</div>
	</div>

	{#if analysisStatus.status !== "idle"}
		<div class="mt-3 p-3 rounded-lg border-2 {
			analysisStatus.status === 'running' ? 'border-blue-400 bg-blue-50' :
			analysisStatus.status === 'completed' ? 'border-green-400 bg-green-50' :
			analysisStatus.status === 'skipped' ? 'border-yellow-400 bg-yellow-50' :
			analysisStatus.status === 'error' ? 'border-red-400 bg-red-50' : ''
		}">
			<div class="flex items-center gap-2">
				<span class="text-lg {analysisStatus.status === 'running' ? 'animate-spin' : ''}">{getStatusIcon()}</span>
				<div class="flex-1">
					<p class="text-sm font-medium {
						analysisStatus.status === 'running' ? 'text-blue-900' :
						analysisStatus.status === 'completed' ? 'text-green-900' :
						analysisStatus.status === 'skipped' ? 'text-yellow-900' :
						analysisStatus.status === 'error' ? 'text-red-900' : ''
					}">
						{analysisStatus.message || 
							(analysisStatus.status === 'running' ? 'Analyzing...' :
							 analysisStatus.status === 'completed' ? 'Analysis completed' :
							 analysisStatus.status === 'skipped' ? 'Analysis skipped' :
							 'Analysis failed')}
					</p>
					{#if analysisStatus.itemCount !== undefined}
						<p class="text-xs text-gray-600 mt-1">
							Processed {analysisStatus.itemCount} new history items
						</p>
					{/if}
					{#if analysisStatus.reason === "no-new-history"}
						<p class="text-xs text-gray-600 mt-1">
							Your browsing patterns haven't changed since the last analysis
						</p>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	{#if aiStatus !== 'available' && !settings.enabled}
		<div class="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
			<p class="text-xs text-amber-800">
				Ambient analysis requires AI to be available. Please check the AI provider status above.
			</p>
		</div>
	{/if}
	
	{#if settings.enabled}
		<div class="mt-3 p-3 rounded-lg {getStatusColor()}">
			<p class="text-xs">
				<strong>Next analysis:</strong> {getNextAnalysisTime()}
				{#if !settings.lastRunTimestamp}
					<span class="text-gray-500">(first run)</span>
				{/if}
			</p>
			<p class="text-xs mt-1">
				Analysis runs in the background without interrupting your browsing.
			</p>
		</div>
	{/if}
</div>