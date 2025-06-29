<script lang="ts">
import { onMount } from "svelte";
import {
	type ChromeAIAvailability,
	getAIModelStatus,
} from "../utils/chrome-ai";

let status: ChromeAIAvailability | null = $state(null);
let checking = $state(true);

onMount(async () => {
	try {
		status = await getAIModelStatus();
	} catch (error) {
		console.error("Error checking Chrome AI status:", error);
		status = "unavailable";
	} finally {
		checking = false;
	}
});

function getStatusColor(status: ChromeAIAvailability | null): string {
	switch (status) {
		case "available":
			return "text-green-600";
		case "downloadable":
			return "text-yellow-600";
		case "downloading":
			return "text-blue-600";
		case "unavailable":
		case null:
			return "text-red-600";
	}
}

function getStatusIcon(status: ChromeAIAvailability | null): string {
	switch (status) {
		case "available":
			return "✓";
		case "downloadable":
			return "↓";
		case "downloading":
			return "⟳";
		case "unavailable":
		case null:
			return "✗";
	}
}

function getStatusMessage(status: ChromeAIAvailability | null): string {
	switch (status) {
		case "available":
			return "Chrome AI is ready to use";
		case "downloadable":
			return "Chrome AI model can be downloaded";
		case "downloading":
			return "Chrome AI model is downloading...";
		case "unavailable":
			return "Chrome AI is not available (requires Chrome 131+)";
		default:
			return "Checking Chrome AI availability...";
	}
}
</script>

{#if checking}
	<div class="flex items-center gap-2 text-sm text-gray-600">
		<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
		<span>Checking Chrome AI availability...</span>
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
	
	{#if status === 'unavailable'}
		<div class="mt-2 text-xs text-gray-600">
			<p>Please use Chrome 131 or later to use the local AI feature.</p>
			<p>You can still use Google Gemini or OpenAI with an API key.</p>
		</div>
	{/if}
{/if}