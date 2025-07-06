<script lang="ts">
import { formatDistanceToNow } from "date-fns";
import {
	ambientSettings,
	toggleAmbientAnalysis,
	updateAmbientSettings,
} from "../stores/ambient-store";
import {
	getClaudeApiKey,
	loadAIConfigFromStorage,
	saveAIConfigToStorage,
	setClaudeApiKey,
} from "../utils/ai-config";
import type { AIProviderType } from "../utils/ai-interface";
import {
	getAvailableProviders,
	getProvider,
	getProviderDisplayName,
} from "../utils/ai-provider-factory";
import type { AutoAnalysisSettings } from "../utils/ambient";
import {
	ANALYSIS_SYSTEM_PROMPT,
	CHUNK_SYSTEM_PROMPT,
	MERGE_SYSTEM_PROMPT,
} from "../utils/constants";
import { ANALYSIS_SCHEMA, CHUNK_SCHEMA } from "../utils/schemas";
import CollapsibleSection from "./CollapsibleSection.svelte";

let { onPromptsChange, onProviderChange } = $props<{
	onPromptsChange?: (prompts: {
		system: string;
		chunk: string;
		merge: string;
	}) => void;
	onProviderChange?: () => void;
}>();

let editableSystemPrompt = $state(ANALYSIS_SYSTEM_PROMPT);
let editableChunkPrompt = $state(CHUNK_SYSTEM_PROMPT);
let editableMergePrompt = $state(MERGE_SYSTEM_PROMPT);
let showAnalysisSchema = $state(false);
let showChunkSchema = $state(false);
let showMergeSchema = $state(false);

// AI Provider state
let currentProvider = $state<AIProviderType>("chrome");
let claudeApiKey = $state("");
let showApiKey = $state(false);
let providerStatus = $state<Record<AIProviderType, string>>({
	chrome: "Unknown",
	claude: "Unknown",
});

// Auto-analysis state
let autoAnalysisSettings = $state<AutoAnalysisSettings>({
	enabled: false,
	notifyOnSuccess: true,
	notifyOnError: true,
});

// Subscribe to the store
$effect(() => {
	const unsubscribe = ambientSettings.subscribe((value) => {
		autoAnalysisSettings = value;
	});

	return unsubscribe;
});

// Load current configuration on mount
(async () => {
	const config = await loadAIConfigFromStorage();
	currentProvider = config.provider;
	claudeApiKey = (await getClaudeApiKey()) || "";

	// Check provider statuses
	await updateProviderStatuses();
})();

async function updateProviderStatuses() {
	const providers: AIProviderType[] = ["chrome", "claude"];

	for (const providerType of providers) {
		try {
			const provider = getProvider({
				provider: providerType,
				claudeApiKey: providerType === "claude" ? claudeApiKey : undefined,
			});
			const status = await provider.getStatus();

			providerStatus[providerType] =
				status === "available"
					? "Available"
					: status === "needs-configuration"
						? "Needs API Key"
						: status === "rate-limited"
							? "Rate Limited"
							: "Unavailable";
		} catch (error) {
			providerStatus[providerType] = "Error";
		}
	}
}

async function handleProviderChange(provider: AIProviderType) {
	currentProvider = provider;
	const config = await loadAIConfigFromStorage();
	config.provider = provider;
	await saveAIConfigToStorage(config);
	await updateProviderStatuses();
	onProviderChange?.();
}

async function handleApiKeyChange() {
	if (claudeApiKey.trim()) {
		await setClaudeApiKey(claudeApiKey.trim());
	}
	await updateProviderStatuses();
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

function getStatusColor(status: string): string {
	switch (status) {
		case "Available":
			return "text-green-600";
		case "Needs API Key":
			return "text-yellow-600";
		case "Rate Limited":
			return "text-orange-600";
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
												{/if}
											</div>
										</div>
									</div>
									<span class={`text-xs font-medium ${getStatusColor(providerStatus[provider])}`}>
										{providerStatus[provider]}
									</span>
								</label>
							{/each}
						</div>
					</fieldset>

					<!-- Claude API Key Input -->
					{#if currentProvider === "claude"}
						<div class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
							<div class="flex items-center justify-between mb-2">
								<label for="claude-api-key" class="block text-sm font-medium text-gray-700">
									Claude API Key
								</label>
								<button
									type="button"
									onclick={() => showApiKey = !showApiKey}
									class="text-xs text-blue-600 hover:text-blue-800"
								>
									{showApiKey ? 'Hide' : 'Show'}
								</button>
							</div>
							<input
								id="claude-api-key"
								type={showApiKey ? "text" : "password"}
								bind:value={claudeApiKey}
								onblur={handleApiKeyChange}
								placeholder="sk-ant-api..."
								class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
							/>
							<p class="mt-1 text-xs text-gray-600">
								Get your API key from <a href="https://console.anthropic.com/" target="_blank" class="text-blue-600 hover:text-blue-800" rel="noopener">Anthropic Console</a>
							</p>
						</div>
					{/if}

					<!-- Current Status -->
					<div class="p-3 bg-gray-50 rounded-lg">
						<div class="text-sm">
							<span class="font-medium text-gray-700">Current Provider: </span>
							<span class="text-gray-900">{getProviderDisplayName(currentProvider)}</span>
							<span class={`ml-2 text-xs font-medium ${getStatusColor(providerStatus[currentProvider])}`}>
								({providerStatus[currentProvider]})
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
								Automatically analyze new browsing history every hour ambiently
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
