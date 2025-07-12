<script lang="ts">
import { match } from "ts-pattern";
import type { AIProviderStatus, AIProviderType } from "../utils/ai-interface";

let {
	status = "unavailable",
	providerType = "chrome",
	onRefresh,
} = $props<{
	status?: AIProviderStatus;
	providerType?: AIProviderType;
	onRefresh?: () => void;
}>();

let providerName = $derived(providerType === "chrome" ? "Chrome AI" : "Claude");
let isRefreshing = $state(false);

async function handleRefresh() {
	if (!onRefresh || isRefreshing) return;

	isRefreshing = true;
	await onRefresh();

	// Keep the refreshing state for a bit to show the change
	setTimeout(() => {
		isRefreshing = false;
	}, 1000);
}

function getStatusColor(status: AIProviderStatus): string {
	return match(status)
		.with("available", () => "text-green-600")
		.with("needs-configuration", () => "text-yellow-600")
		.with("rate-limited", () => "text-orange-600")
		.with("error", "unavailable", () => "text-red-600")
		.exhaustive();
}

function getStatusIcon(status: AIProviderStatus): string {
	return match(status)
		.with("available", () => "✓")
		.with("needs-configuration", () => "⚙")
		.with("rate-limited", () => "⏳")
		.with("error", "unavailable", () => "✗")
		.exhaustive();
}

function getStatusMessage(status: AIProviderStatus): string {
	return match(status)
		.with("available", () => `${providerName} is ready to use`)
		.with("needs-configuration", () => `${providerName} needs configuration`)
		.with("rate-limited", () => `${providerName} is rate limited`)
		.with("error", () => `${providerName} has an error`)
		.with("unavailable", () => `${providerName} is not available`)
		.exhaustive();
}
</script>

<div class={`flex items-center gap-2 text-sm ${isRefreshing ? 'text-gray-500' : getStatusColor(status)}`}>
	<span class="text-lg">{isRefreshing ? '⟳' : getStatusIcon(status)}</span>
	<span>{isRefreshing ? 'Checking Chrome AI status...' : getStatusMessage(status)}</span>
</div>

{#if status === 'needs-configuration'}
	<div class="mt-2 text-xs text-gray-600">
		<p>Please configure your API key in Advanced Settings.</p>
	</div>
{/if}

{#if status === 'unavailable' && providerName === 'Chrome AI'}
	<div class="mt-2 text-xs text-gray-600">
		{#if !isRefreshing}
			<p>Chrome AI is not available. Please ensure:</p>
			<ul class="mt-1 ml-4 list-disc">
				<li>You're using Chrome 138 or later</li>
				<li>Enable "Prompt API for Gemini Nano" in chrome://flags</li>
				<li>Update "Optimization Guide On Device Model" in chrome://components
					<div class="mt-1 ml-4 text-yellow-600 font-medium">
						⚠️ Warning: This will download a model that is ~4GB
					</div>
				</li>
			</ul>
			{#if onRefresh}
				<button
					onclick={handleRefresh}
					class="mt-3 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer transition-colors duration-150"
				>
					Check Status Again
				</button>
			{/if}
		{:else}
			<p class="text-gray-500">Checking Chrome AI status...</p>
		{/if}
	</div>
{:else if status === 'unavailable'}
	<div class="mt-2 text-xs text-gray-600">
		<p>{providerName} is not available or not configured properly.</p>
	</div>
{/if}

{#if status === 'error'}
	<div class="mt-2 text-xs text-gray-600">
		<p>There was an error connecting to {providerName}. Please check your configuration.</p>
	</div>
{/if}