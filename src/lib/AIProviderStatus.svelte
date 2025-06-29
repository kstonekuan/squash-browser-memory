<script lang="ts">
import { onMount } from "svelte";
import { loadAIConfig } from "../utils/ai-config";
import type { AIProviderStatus } from "../utils/ai-interface";
import { AIProviderFactory } from "../utils/ai-provider-factory";
import { getAIModelStatus } from "../utils/chrome-ai";

let status: Availability | AIProviderStatus | null = $state(null);
let checking = $state(true);
let providerName = $state("AI");

onMount(async () => {
	try {
		const config = await loadAIConfig();
		const provider = AIProviderFactory.getProvider(config);
		providerName = provider.getProviderName();

		if (config.provider === "chrome") {
			// For Chrome AI, use the legacy status check
			status = await getAIModelStatus();
		} else {
			// For other providers, use the provider status
			status = await provider.getStatus();
		}
	} catch (error) {
		console.error("Error checking AI provider status:", error);
		status = "unavailable";
	} finally {
		checking = false;
	}
});

function getStatusColor(
	status: Availability | AIProviderStatus | null,
): string {
	switch (status) {
		case "available":
			return "text-green-600";
		case "downloadable":
			return "text-yellow-600";
		case "downloading":
			return "text-blue-600";
		case "needs-configuration":
			return "text-yellow-600";
		case "rate-limited":
			return "text-orange-600";
		case "error":
		case "unavailable":
		case null:
			return "text-red-600";
	}
}

function getStatusIcon(status: Availability | AIProviderStatus | null): string {
	switch (status) {
		case "available":
			return "✓";
		case "downloadable":
			return "↓";
		case "downloading":
			return "⟳";
		case "needs-configuration":
			return "⚙";
		case "rate-limited":
			return "⏳";
		case "error":
		case "unavailable":
		case null:
			return "✗";
	}
}

function getStatusMessage(
	status: Availability | AIProviderStatus | null,
): string {
	switch (status) {
		case "available":
			return `${providerName} is ready to use`;
		case "downloadable":
			return `${providerName} model can be downloaded`;
		case "downloading":
			return `${providerName} model is downloading...`;
		case "needs-configuration":
			return `${providerName} needs configuration`;
		case "rate-limited":
			return `${providerName} is rate limited`;
		case "error":
			return `${providerName} has an error`;
		case "unavailable":
			return `${providerName} is not available`;
		default:
			return `Checking ${providerName} availability...`;
	}
}
</script>

{#if checking}
	<div class="flex items-center gap-2 text-sm text-gray-600">
		<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
		<span>Checking {providerName} availability...</span>
	</div>
{:else}
	<div class={`flex items-center gap-2 text-sm ${getStatusColor(status)}`}>
		<span class="text-lg">{getStatusIcon(status)}</span>
		<span>{getStatusMessage(status)}</span>
	</div>
	
	{#if status === 'downloadable'}
		<div class="mt-2 text-xs text-gray-600">
			<p>The AI model will be downloaded automatically when you first use it.</p>
			<p>This is a one-time download of approximately 20MB.</p>
		</div>
	{/if}
	
	{#if status === 'needs-configuration'}
		<div class="mt-2 text-xs text-gray-600">
			<p>Please configure your API key in Advanced Settings.</p>
		</div>
	{/if}
	
	{#if status === 'unavailable'}
		<div class="mt-2 text-xs text-gray-600">
			<p>{providerName} is not available or not configured properly.</p>
		</div>
	{/if}
	
	{#if status === 'error'}
		<div class="mt-2 text-xs text-gray-600">
			<p>There was an error connecting to {providerName}. Please check your configuration.</p>
		</div>
	{/if}
{/if}