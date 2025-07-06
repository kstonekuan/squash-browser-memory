<script lang="ts">
import { onMount } from "svelte";
import { loadAIConfigFromStorage } from "../utils/ai-config";
import type { AIProviderStatus } from "../utils/ai-interface";
import { getProvider } from "../utils/ai-provider-factory";

let { onProviderChange } = $props<{
	onProviderChange?: () => void;
}>();

let status: AIProviderStatus | null = $state(null);
let checking = $state(true);
let providerName = $state("AI");
let isDownloading = $state(false);
let downloadProgress = $state(0);

onMount(async () => {
	try {
		const config = await loadAIConfigFromStorage();
		const provider = getProvider(config);
		providerName = provider.getProviderName();

		// For Chrome AI, try to initialize with download progress
		if (config.provider === "chrome") {
			try {
				// First check basic availability
				status = await provider.getStatus();

				// If not available, try to initialize which will trigger download
				if (status === "unavailable") {
					isDownloading = true;
					await provider.initialize(undefined, (progress) => {
						downloadProgress = progress;
					});
					// Re-check status after initialization
					status = await provider.getStatus();
				}
			} catch (error) {
				console.error("Error initializing Chrome AI:", error);
				status = "unavailable";
			} finally {
				isDownloading = false;
			}
		} else {
			// For other providers, just check status
			status = await provider.getStatus();
		}
	} catch (error) {
		console.error("Error checking AI provider status:", error);
		status = "unavailable";
	} finally {
		checking = false;
	}
});

function getStatusColor(status: AIProviderStatus | null): string {
	switch (status) {
		case "available":
			return "text-green-600";
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

function getStatusIcon(status: AIProviderStatus | null): string {
	switch (status) {
		case "available":
			return "✓";
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

function getStatusMessage(status: AIProviderStatus | null): string {
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
{:else if isDownloading}
	<div class="space-y-3">
		<div class="flex items-center gap-2 text-sm text-blue-600">
			<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
			<span>Downloading Chrome AI model...</span>
		</div>
		<div class="w-full bg-gray-200 rounded-full h-2">
			<div 
				class="bg-blue-600 h-2 rounded-full transition-all duration-300"
				style="width: {downloadProgress}%"
			></div>
		</div>
		<p class="text-xs text-gray-600">
			{Math.round(downloadProgress)}% complete - This is a one-time download of approximately 2GB
		</p>
	</div>
{:else}
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
				<li>"Prompt API for Gemini Nano" is enabled in chrome://flags</li>
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
{/if}