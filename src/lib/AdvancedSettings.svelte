<script lang="ts">
import { formatDistanceToNow } from "date-fns";
import {
	getAmbientSettings,
	toggleAmbientAnalysis,
	updateAmbientSettings,
} from "../state/ambient-settings.svelte";
import { sidepanelToBackgroundClient } from "../trpc/client";
import type { AIProviderStatus } from "../types/ui-types";
import {
	getClaudeApiKey,
	getGeminiApiKey,
	loadAIConfigFromStorage,
	saveAIConfigToStorage,
	setClaudeApiKey,
	setGeminiApiKey,
} from "../utils/ai-config";
import type { AIProviderType } from "../utils/ai-interface";
import {
	getAvailableProviders,
	getProviderDisplayName,
} from "../utils/ai-provider-factory";
import type { AutoAnalysisSettings } from "../utils/ambient";
import { defaultAutoAnalysisSettings } from "../utils/ambient";
import {
	CLAUDE_CONSOLE_NAME,
	CLAUDE_CONSOLE_URL,
} from "../utils/claude-provider";
import {
	ANALYSIS_SYSTEM_PROMPT,
	CHUNK_SYSTEM_PROMPT,
	MERGE_SYSTEM_PROMPT,
} from "../utils/constants";
import {
	GEMINI_CONSOLE_NAME,
	GEMINI_CONSOLE_URL,
} from "../utils/gemini-provider";
import { ANALYSIS_SCHEMA, CHUNK_SCHEMA } from "../utils/schemas";
import CollapsibleSection from "./CollapsibleSection.svelte";
import RemoteAIProviderSettings from "./RemoteAIProviderSettings.svelte";

let {
	onPromptsChange,
	onProviderChange,
	aiStatus = "unavailable",
	currentProviderType = "chrome",
} = $props<{
	onPromptsChange?: (prompts: {
		system: string;
		chunk: string;
		merge: string;
	}) => void;
	onProviderChange?: () => void;
	aiStatus?: AIProviderStatus;
	currentProviderType?: AIProviderType;
}>();

let editableSystemPrompt = $state(ANALYSIS_SYSTEM_PROMPT);
let editableChunkPrompt = $state(CHUNK_SYSTEM_PROMPT);
let editableMergePrompt = $state(MERGE_SYSTEM_PROMPT);
let showAnalysisSchema = $state(false);
let showChunkSchema = $state(false);
let showMergeSchema = $state(false);

// AI Provider state
let currentProvider = $state<AIProviderType>(currentProviderType);
let claudeApiKey = $state("");
let geminiApiKey = $state("");
let showApiKey = $state(false);

// Auto-analysis state
let autoAnalysisSettings = $state<AutoAnalysisSettings>(
	defaultAutoAnalysisSettings,
);

// Provider status cache for non-current providers
let providerStatuses = $state<Record<AIProviderType, string>>({
	chrome: "Unknown",
	claude: "Unknown",
	gemini: "Unknown",
});

// Remote provider configurations
const remoteProviderConfigs = {
	claude: {
		type: "claude" as AIProviderType,
		name: "Claude",
		placeholder: "sk-ant-api...",
		consoleUrl: CLAUDE_CONSOLE_URL,
		consoleName: CLAUDE_CONSOLE_NAME,
		colorClass: "bg-yellow-50 border-yellow-200",
	},
	gemini: {
		type: "gemini" as AIProviderType,
		name: "Gemini",
		placeholder: "AIza...",
		consoleUrl: GEMINI_CONSOLE_URL,
		consoleName: GEMINI_CONSOLE_NAME,
		colorClass: "bg-blue-50 border-blue-200",
	},
};

// Sync with the store state
$effect(() => {
	autoAnalysisSettings = getAmbientSettings();
});

// Update current provider when prop changes
$effect(() => {
	currentProvider = currentProviderType;
});

// Format provider status for display
function formatProviderStatus(status: AIProviderStatus): string {
	switch (status) {
		case "available":
			return "Available";
		case "unavailable":
			return "Not available";
		case "needs-configuration":
			return "Needs API Key";
		case "rate-limited":
			return "Rate limited";
		case "error":
			return "Error";
		case "loading":
			return "Checking...";
		default:
			return "Unknown";
	}
}

// Load API keys and check provider statuses on mount
(async () => {
	claudeApiKey = (await getClaudeApiKey()) || "";
	geminiApiKey = (await getGeminiApiKey()) || "";

	// Check status of non-current providers
	checkProviderStatuses();
})();

// Check the status of all providers
async function checkProviderStatuses() {
	try {
		// Query all provider statuses from the offscreen document
		const client = sidepanelToBackgroundClient;
		const result = await client.ai.checkAllProvidersStatus.query();

		if (result.type === "success" && "statuses" in result) {
			// Update the statuses for non-current providers
			for (const [provider, status] of Object.entries(result.statuses) as [
				AIProviderType,
				AIProviderStatus,
			][]) {
				if (provider !== currentProvider) {
					providerStatuses[provider] = formatProviderStatus(status);
				}
			}
		} else if (result.type === "error" && "message" in result) {
			console.error("Failed to check provider statuses:", result.message);
			throw new Error(result.message);
		}
	} catch (error) {
		console.error("Failed to check provider statuses:", error);
		// Fallback to checking API keys
		if (currentProvider !== "claude") {
			const key = await getClaudeApiKey();
			providerStatuses.claude = key ? "Ready" : "Needs API Key";
		}
		if (currentProvider !== "gemini") {
			const key = await getGeminiApiKey();
			providerStatuses.gemini = key ? "Ready" : "Needs API Key";
		}
		if (currentProvider !== "chrome") {
			providerStatuses.chrome = "Check availability";
		}
	}
}

async function handleProviderChange(provider: AIProviderType) {
	currentProvider = provider;
	const config = await loadAIConfigFromStorage();
	config.provider = provider;
	await saveAIConfigToStorage(config);

	// Load the API key for the selected provider if it exists
	if (provider === "claude") {
		claudeApiKey = (await getClaudeApiKey()) || "";
	} else if (provider === "gemini") {
		geminiApiKey = (await getGeminiApiKey()) || "";
	}

	onProviderChange?.();
}

async function handleClaudeApiKeyChange() {
	// Save the key even if it's empty (to clear it)
	await setClaudeApiKey(claudeApiKey.trim() || null);

	// Clear the provider cache when key changes
	try {
		await sidepanelToBackgroundClient.ai.clearProviderCache.mutate({
			provider: "claude",
		});
	} catch (error) {
		console.error("Failed to clear provider cache:", error);
	}

	// Update status for Claude if it's not the current provider
	if (currentProvider !== "claude") {
		providerStatuses.claude = claudeApiKey.trim() ? "Ready" : "Needs API Key";
	}

	// Re-check all provider statuses after key change
	checkProviderStatuses();

	onProviderChange?.();
}

async function handleGeminiApiKeyChange() {
	// Save the key even if it's empty (to clear it)
	await setGeminiApiKey(geminiApiKey.trim() || null);

	// Clear the provider cache when key changes
	try {
		await sidepanelToBackgroundClient.ai.clearProviderCache.mutate({
			provider: "gemini",
		});
	} catch (error) {
		console.error("Failed to clear provider cache:", error);
	}

	// Update status for Gemini if it's not the current provider
	if (currentProvider !== "gemini") {
		providerStatuses.gemini = geminiApiKey.trim() ? "Ready" : "Needs API Key";
	}

	// Re-check all provider statuses after key change
	checkProviderStatuses();

	onProviderChange?.();
}

function handlePromptChange() {
	onPromptsChange?.({
		system: editableSystemPrompt,
		chunk: editableChunkPrompt,
		merge: editableMergePrompt,
	});
}

function resetPrompts() {
	editableSystemPrompt = ANALYSIS_SYSTEM_PROMPT;
	editableChunkPrompt = CHUNK_SYSTEM_PROMPT;
	editableMergePrompt = MERGE_SYSTEM_PROMPT;
	handlePromptChange();
}

function getProviderStatus(provider: AIProviderType): string {
	// For the current provider, use the unified status
	if (provider === currentProvider) {
		switch (aiStatus) {
			case "available":
				return "Available";
			case "needs-configuration":
				return "Needs API Key";
			case "rate-limited":
				return "Rate Limited";
			case "error":
				return "Error";
			case "loading":
				return "Loading...";
			case "unavailable":
			default:
				return "Unavailable";
		}
	}
	// For other providers, use the cached status
	return providerStatuses[provider];
}

function getStatusColor(status: string): string {
	switch (status) {
		case "Available":
		case "Ready":
			return "text-green-600";
		case "Needs API Key":
			return "text-yellow-600";
		case "Rate Limited":
			return "text-orange-600";
		case "Loading...":
		case "Check availability":
			return "text-blue-600";
		case "Unknown":
			return "text-gray-500";
		default:
			return "text-red-600";
	}
}

async function handleAutoAnalysisToggle() {
	try {
		await toggleAmbientAnalysis();
		console.log(
			"Auto-analysis",
			autoAnalysisSettings.enabled ? "enabled" : "disabled",
		);
	} catch (error) {
		console.error("Failed to toggle auto-analysis:", error);
		alert("Failed to update auto-analysis settings");
	}
}

function formatLastRunTime(): string {
	if (!autoAnalysisSettings.lastRunTimestamp) {
		return "Never";
	}

	const date = new Date(autoAnalysisSettings.lastRunTimestamp);
	return formatDistanceToNow(date, { addSuffix: true });
}
</script>

<div class="space-y-4">
	<!-- AI Provider Selection -->
	<CollapsibleSection title="AI Provider Settings">
				<div class="space-y-4">
					<!-- Provider Selection -->
					<fieldset>
						<legend class="block text-sm font-medium text-gray-700 mb-3">
							Select AI Provider
						</legend>
						<div class="space-y-2">
							{#each getAvailableProviders() as provider}
								<label class="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
									<div class="flex items-center">
										<input
											type="radio"
											bind:group={currentProvider}
											value={provider}
											onchange={() => handleProviderChange(provider)}
											class="mr-3 text-blue-600 focus:ring-blue-500"
										/>
										<div>
											<div class="text-sm font-medium text-gray-900">
												{getProviderDisplayName(provider)}
											</div>
											<div class="text-xs text-gray-500">
												{#if provider === "chrome"}
													Uses Chrome's built-in AI (local, private, free)
												{:else if provider === "claude"}
													Uses Anthropic's Claude API (remote, requires API key)
												{:else if provider === "gemini"}
													Uses Google's Gemini API (remote, requires API key)
												{/if}
											</div>
										</div>
									</div>
									<span class={`text-xs font-medium ${getStatusColor(getProviderStatus(provider))}`}>
										{getProviderStatus(provider)}
									</span>
								</label>
							{/each}
						</div>
					</fieldset>

					<!-- Remote AI Provider Settings -->
					{#if currentProvider === "claude"}
						<RemoteAIProviderSettings
							provider={remoteProviderConfigs.claude}
							bind:apiKey={claudeApiKey}
							bind:showApiKey
							onApiKeyChange={handleClaudeApiKeyChange}
						/>
					{/if}

					{#if currentProvider === "gemini"}
						<RemoteAIProviderSettings
							provider={remoteProviderConfigs.gemini}
							bind:apiKey={geminiApiKey}
							bind:showApiKey
							onApiKeyChange={handleGeminiApiKeyChange}
						/>
					{/if}

					<!-- Current Status -->
					<div class="p-3 bg-gray-50 rounded-lg">
						<div class="text-sm">
							<span class="font-medium text-gray-700">Current Provider: </span>
							<span class="text-gray-900">{getProviderDisplayName(currentProvider)}</span>
							<span class={`ml-2 text-xs font-medium ${getStatusColor(getProviderStatus(currentProvider))}`}>
								({getProviderStatus(currentProvider)})
							</span>
						</div>
					</div>
				</div>
	</CollapsibleSection>

	<!-- Prompt Customization Section -->
	<CollapsibleSection title="Customize AI Prompts">
				<div class="space-y-4">
					<!-- System Prompt -->
					<div>
						<div class="flex items-center justify-between mb-2">
							<label for="system-prompt" class="block text-sm font-medium text-gray-700">
								Analysis System Prompt
							</label>
							<button
								type="button"
								onclick={() => showAnalysisSchema = !showAnalysisSchema}
								class="text-xs text-blue-600 hover:text-blue-800"
							>
								{showAnalysisSchema ? 'Hide' : 'Show'} Expected Output Schema
							</button>
						</div>
						<textarea
							id="system-prompt"
							bind:value={editableSystemPrompt}
							oninput={handlePromptChange}
							rows="4"
							class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
							placeholder="Enter custom system prompt..."
						></textarea>
						<p class="mt-1 text-xs text-gray-500">
							This prompt guides the AI when analyzing browsing patterns to identify workflows and create user profiles.
						</p>
						{#if showAnalysisSchema}
							<div class="mt-2 p-3 bg-gray-100 rounded-md">
								<p class="text-xs font-medium text-gray-700 mb-1">Expected Output Schema:</p>
								<pre class="text-xs text-gray-600 overflow-x-auto">{JSON.stringify(ANALYSIS_SCHEMA, null, 2)}</pre>
							</div>
						{/if}
					</div>
					
					<!-- Chunk Prompt -->
					<div>
						<div class="flex items-center justify-between mb-2">
							<label for="chunk-prompt" class="block text-sm font-medium text-gray-700">
								Chunking System Prompt
							</label>
							<button
								type="button"
								onclick={() => showChunkSchema = !showChunkSchema}
								class="text-xs text-blue-600 hover:text-blue-800"
							>
								{showChunkSchema ? 'Hide' : 'Show'} Expected Output Schema
							</button>
						</div>
						<textarea
							id="chunk-prompt"
							bind:value={editableChunkPrompt}
							oninput={handlePromptChange}
							rows="4"
							class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
							placeholder="Enter custom chunking prompt..."
						></textarea>
						<p class="mt-1 text-xs text-gray-500">
							This prompt guides the AI when identifying natural browsing sessions from timestamps.
						</p>
						{#if showChunkSchema}
							<div class="mt-2 p-3 bg-gray-100 rounded-md">
								<p class="text-xs font-medium text-gray-700 mb-1">Expected Output Schema:</p>
								<pre class="text-xs text-gray-600 overflow-x-auto">{JSON.stringify(CHUNK_SCHEMA, null, 2)}</pre>
							</div>
						{/if}
					</div>
					
					<!-- Merge Prompt -->
					<div>
						<div class="flex items-center justify-between mb-2">
							<label for="merge-prompt" class="block text-sm font-medium text-gray-700">
								Merge System Prompt
							</label>
							<button
								type="button"
								onclick={() => showMergeSchema = !showMergeSchema}
								class="text-xs text-blue-600 hover:text-blue-800"
							>
								{showMergeSchema ? 'Hide' : 'Show'} Expected Output Schema
							</button>
						</div>
						<textarea
							id="merge-prompt"
							bind:value={editableMergePrompt}
							oninput={handlePromptChange}
							rows="4"
							class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
							placeholder="Enter custom merge prompt..."
						></textarea>
						<p class="mt-1 text-xs text-gray-500">
							This prompt guides the AI when merging new analysis results with existing memory.
						</p>
						{#if showMergeSchema}
							<div class="mt-2 p-3 bg-gray-100 rounded-md">
								<p class="text-xs font-medium text-gray-700 mb-1">Expected Output Schema:</p>
								<pre class="text-xs text-gray-600 overflow-x-auto">{JSON.stringify(ANALYSIS_SCHEMA, null, 2)}</pre>
								<p class="mt-2 text-xs text-gray-500">Note: The merge operation uses the same schema as the analysis.</p>
							</div>
						{/if}
					</div>
					
					<div class="flex justify-end">
						<button
							onclick={resetPrompts}
							class="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
						>
							Reset to defaults
						</button>
					</div>
				</div>
	</CollapsibleSection>
	
	<!-- Auto-Analysis Settings -->
	<CollapsibleSection title="Automatic Ambient Analysis" data-settings-section="auto-analysis">
				<div class="space-y-4">
					<!-- Enable/Disable Toggle -->
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<label for="auto-analysis-toggle" class="text-sm font-medium text-gray-700">
								Enable Hourly Analysis
							</label>
							<p class="text-xs text-gray-500 mt-1">
								Automatically analyze new browsing events every hour ambiently
							</p>
						</div>
						<div class="ml-4">
							<button
								id="auto-analysis-toggle"
								role="switch"
								aria-checked={autoAnalysisSettings.enabled}
								onclick={handleAutoAnalysisToggle}
								class={`
									relative inline-flex h-8 w-14 items-center rounded-full transition-colors
									${autoAnalysisSettings.enabled ? "bg-blue-600" : "bg-gray-200"}
									cursor-pointer
								`}
							>
							<span class="sr-only">Enable auto-analysis</span>
							<span
								class={`
									inline-block h-6 w-6 transform rounded-full bg-white transition-transform shadow-sm
									${autoAnalysisSettings.enabled ? "translate-x-7" : "translate-x-1"}
								`}
							></span>
						</button>
						</div>
					</div>
					
					<!-- Notification Settings -->
					{#if autoAnalysisSettings.enabled}
						<div class="space-y-3 pl-4 border-l-2 border-gray-200">
							<label class="flex items-center">
								<input
									type="checkbox"
									bind:checked={autoAnalysisSettings.notifyOnSuccess}
									onchange={() => updateAmbientSettings({ notifyOnSuccess: autoAnalysisSettings.notifyOnSuccess })}
									class="mr-2 text-blue-600 focus:ring-blue-500"
								/>
								<span class="text-sm text-gray-700">Notify on successful analysis</span>
							</label>
							
							<label class="flex items-center">
								<input
									type="checkbox"
									bind:checked={autoAnalysisSettings.notifyOnError}
									onchange={() => updateAmbientSettings({ notifyOnError: autoAnalysisSettings.notifyOnError })}
									class="mr-2 text-blue-600 focus:ring-blue-500"
								/>
								<span class="text-sm text-gray-700">Notify on analysis errors</span>
							</label>
						</div>
					{/if}
					
					<!-- Status Information -->
					{#if autoAnalysisSettings.lastRunTimestamp}
						<div class="p-3 bg-gray-50 rounded-lg space-y-2">
							<div class="text-sm">
								<span class="font-medium text-gray-700">Last Run:</span>
								<span class="text-gray-900 ml-1">{formatLastRunTime()}</span>
							</div>
							
							{#if autoAnalysisSettings.lastRunStatus}
								<div class="text-sm">
									<span class="font-medium text-gray-700">Status:</span>
									<span class={`ml-1 ${
										autoAnalysisSettings.lastRunStatus === 'success' 
											? 'text-green-600' 
											: 'text-red-600'
									}`}>
										{autoAnalysisSettings.lastRunStatus === 'success' ? 'Success' : 'Failed'}
									</span>
									
									{#if autoAnalysisSettings.lastRunError}
										<p class="text-xs text-red-600 mt-1">
											Error: {autoAnalysisSettings.lastRunError}
										</p>
									{/if}
								</div>
							{/if}
						</div>
					{/if}
					
					{#if autoAnalysisSettings.enabled}
						<p class="text-xs text-gray-500">
							{#if !autoAnalysisSettings.lastRunTimestamp}
								First analysis will run in 1 minute, then every hour thereafter.
							{:else}
								Ambient analysis runs every hour when Chrome is open.
							{/if}
							Analysis only processes new history since the last run.
						</p>
					{/if}
				</div>
	</CollapsibleSection>
</div>
