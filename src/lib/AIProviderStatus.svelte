<script lang="ts">
import type { AIProviderStatus, AIProviderType } from "../utils/ai-interface";

let { status = "unavailable", providerType = "chrome" } = $props<{
	status?: AIProviderStatus;
	providerType?: AIProviderType;
}>();

let providerName = $derived(providerType === "chrome" ? "Chrome AI" : "Claude");

function getStatusColor(status: AIProviderStatus): string {
	switch (status) {
		case "available":
			return "text-green-600";
		case "needs-configuration":
			return "text-yellow-600";
		case "rate-limited":
			return "text-orange-600";
		case "error":
		case "unavailable":
			return "text-red-600";
	}
}

function getStatusIcon(status: AIProviderStatus): string {
	switch (status) {
		case "available":
			return "✓";
		case "needs-configuration":
			return "⚙";
		case "rate-limited":
			return "⏳";
		case "error":
		case "unavailable":
			return "✗";
	}
}

function getStatusMessage(status: AIProviderStatus): string {
	switch (status) {
		case "available":
			return `${providerName} is ready to use`;
		case "needs-configuration":
			return `${providerName} needs configuration`;
		case "rate-limited":
			return `${providerName} is rate limited`;
		case "error":
			return `${providerName} has an error`;
		case "unavailable":
			return `${providerName} is not available`;
	}
}
</script>

<div class={`flex items-center gap-2 text-sm ${getStatusColor(status)}`}>
	<span class="text-lg">{getStatusIcon(status)}</span>
	<span>{getStatusMessage(status)}</span>
</div>

{#if status === 'needs-configuration'}
	<div class="mt-2 text-xs text-gray-600">
		<p>Please configure your API key in Advanced Settings.</p>
	</div>
{/if}

{#if status === 'unavailable' && providerName === 'Chrome AI'}
	<div class="mt-2 text-xs text-gray-600">
		<p>Chrome AI is not available. Please ensure:</p>
		<ul class="mt-1 ml-4 list-disc">
			<li>You're using Chrome 138 or later</li>
			<li>Enable "Prompt API for Gemini Nano" in chrome://flags</li>
			<li>Update "Optimization Guide On Device Model" in chrome://components</li>
		</ul>
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