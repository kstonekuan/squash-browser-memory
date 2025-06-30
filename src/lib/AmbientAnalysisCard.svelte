<script lang="ts">
import { onMount } from "svelte";
import {
	type AutoAnalysisSettings,
	loadAutoAnalysisSettings,
	saveAutoAnalysisSettings,
} from "../utils/ambient";

let settings = $state<AutoAnalysisSettings>({
	enabled: false,
	notifyOnSuccess: true,
	notifyOnError: true,
});
let loading = $state(true);
let toggling = $state(false);

onMount(async () => {
	settings = await loadAutoAnalysisSettings();
	loading = false;
});

async function toggleAmbientAnalysis() {
	toggling = true;
	try {
		settings.enabled = !settings.enabled;
		await saveAutoAnalysisSettings(settings);

		// Send message to background script to update alarm
		const response = await chrome.runtime.sendMessage({
			type: "toggle-auto-analysis",
			enabled: settings.enabled,
		});

		if (!response?.success) {
			throw new Error(response?.error || "Failed to update auto-analysis");
		}
	} catch (error) {
		console.error("Failed to toggle ambient analysis:", error);
		// Revert the toggle on error
		settings.enabled = !settings.enabled;
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
	const diffMins = Math.floor(diffMs / 60000);

	if (diffMins < 1) {
		return "Just now";
	} else if (diffMins < 60) {
		return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
	} else if (diffMins < 1440) {
		const hours = Math.floor(diffMins / 60);
		return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
	} else {
		return date.toLocaleDateString();
	}
}

function getStatusIcon() {
	if (loading) return "⏳";
	if (settings.lastRunStatus === "error") return "❌";
	if (settings.enabled) return "✅";
	return "⏸️";
}

function getStatusColor() {
	if (settings.lastRunStatus === "error") return "text-red-600 bg-red-50";
	if (settings.enabled) return "text-blue-600 bg-blue-50";
	return "text-gray-600 bg-gray-50";
}
</script>

<div class="bg-white rounded-lg shadow-sm p-4 mb-4">
	<div class="flex items-center justify-between">
		<div class="flex-1">
			<div class="flex items-center gap-2 mb-2">
				<span class="text-2xl">{getStatusIcon()}</span>
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
			
			<p class="text-sm text-gray-600 mb-3">
				Automatically analyze your browsing history every hour to discover patterns and update your profile.
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
				disabled={loading || toggling}
				class={`
					relative inline-flex h-8 w-14 items-center rounded-full transition-colors
					${settings.enabled ? "bg-blue-600" : "bg-gray-200"}
					${loading || toggling ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
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

	{#if settings.enabled}
		<div class="mt-3 p-3 rounded-lg {getStatusColor()}">
			<p class="text-xs">
				<strong>Next analysis:</strong> Within the next 
				{#if settings.lastRunTimestamp}
					{@const nextRun = 60 - Math.floor((Date.now() - settings.lastRunTimestamp) / 60000) % 60}
					{nextRun} minute{nextRun !== 1 ? "s" : ""}
				{:else}
					60 minutes
				{/if}
			</p>
			<p class="text-xs mt-1">
				Analysis runs in the background without interrupting your browsing.
			</p>
		</div>
	{/if}
</div>