<script lang="ts">
import { formatDistanceToNow } from "date-fns";
import { toJSONSchema } from "zod/v4";
import {
	getAmbientSettings,
	toggleAmbientAnalysis,
	updateAmbientSettings,
} from "../state/ambient-settings.svelte";
import type { AIProviderStatus } from "../types/ui-types";
import {
	getClaudeApiKey,
	getGeminiApiKey,
	getOpenAIApiKey,
	getOpenAIBaseUrl,
	getOpenAIModel,
	loadAIConfigFromStorage,
	saveAIConfigToStorage,
	setClaudeApiKey,
	setGeminiApiKey,
	setOpenAIApiKey,
	setOpenAIBaseUrl,
	setOpenAIModel,
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
	CHUNK_SYSTEM_PROMPT,
	MERGE_SYSTEM_PROMPT,
	USER_PROFILE_SYSTEM_PROMPT,
	WORKFLOW_PATTERNS_SYSTEM_PROMPT,
} from "../utils/constants";
import {
	GEMINI_CONSOLE_NAME,
	GEMINI_CONSOLE_URL,
} from "../utils/gemini-provider";
import {
	OPENAI_CONSOLE_NAME,
	OPENAI_CONSOLE_URL,
} from "../utils/openai-provider";
import {
	ChunkSchema,
	UserProfileSchema,
	WorkflowPatternsOnlySchema,
} from "../utils/schemas";
import CollapsibleSection from "./CollapsibleSection.svelte";
import OpenAIProviderSettings from "./OpenAIProviderSettings.svelte";
import RemoteAIProviderSettings from "./RemoteAIProviderSettings.svelte";

type Props = {
	onPromptsChange?: (prompts: {
		system: string;
		workflow: string;
		chunk: string;
		merge: string;
	}) => void;
	onProviderChange?: () => void;
	aiStatus?: AIProviderStatus;
	currentProviderType?: AIProviderType;
};

let {
	onPromptsChange,
	onProviderChange,
	aiStatus = "unavailable",
	currentProviderType = "chrome",
}: Props = $props();

let editableProfilePrompt = $state(USER_PROFILE_SYSTEM_PROMPT);
let editableWorkflowPrompt = $state(WORKFLOW_PATTERNS_SYSTEM_PROMPT);
let editableChunkPrompt = $state(CHUNK_SYSTEM_PROMPT);
let editableMergePrompt = $state(MERGE_SYSTEM_PROMPT);
let showAnalysisSchema = $state(false);
let showWorkflowSchema = $state(false);
let showChunkSchema = $state(false);
let showMergeSchema = $state(false);

// AI Provider state
let currentProvider = $state<AIProviderType>(currentProviderType);
let claudeApiKey = $state("");
let geminiApiKey = $state("");
let openaiApiKey = $state("");
let openaiBaseUrl = $state("");
let openaiModel = $state("");
let showApiKey = $state(false);

// Auto-analysis state
let autoAnalysisSettings = $state<AutoAnalysisSettings>(
	defaultAutoAnalysisSettings,
);

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
	openai: {
		type: "openai" as AIProviderType,
		name: "OpenAI",
		apiKeyPlaceholder: "sk-...",
		baseUrlPlaceholder: "https://api.openai.com/v1",
		modelPlaceholder: "gpt-4o-mini",
		consoleUrl: OPENAI_CONSOLE_URL,
		consoleName: OPENAI_CONSOLE_NAME,
		colorClass: "bg-green-50 border-green-200",
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

// Load API keys on mount
$effect(() => {
	(async () => {
		claudeApiKey = (await getClaudeApiKey()) || "";
		geminiApiKey = (await getGeminiApiKey()) || "";
		openaiApiKey = (await getOpenAIApiKey()) || "";
		openaiBaseUrl = (await getOpenAIBaseUrl()) || "";
		openaiModel = (await getOpenAIModel()) || "";
	})();
});

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
	} else if (provider === "openai") {
		openaiApiKey = (await getOpenAIApiKey()) || "";
		openaiBaseUrl = (await getOpenAIBaseUrl()) || "";
		openaiModel = (await getOpenAIModel()) || "";
	}

	onProviderChange?.();
}

async function handleClaudeApiKeyChange() {
	const newKey = claudeApiKey.trim() || null;
	const oldKey = await getClaudeApiKey();

	// Only proceed if the key actually changed
	if (newKey === oldKey) {
		return;
	}

	// Save the key even if it's empty (to clear it)
	await setClaudeApiKey(newKey);

	// If Claude is the current provider, trigger provider change to update status
	if (currentProvider === "claude") {
		onProviderChange?.();
	}
}

async function handleGeminiApiKeyChange() {
	const newKey = geminiApiKey.trim() || null;
	const oldKey = await getGeminiApiKey();

	// Only proceed if the key actually changed
	if (newKey === oldKey) {
		return;
	}

	// Save the key even if it's empty (to clear it)
	await setGeminiApiKey(newKey);

	// If Gemini is the current provider, trigger provider change to update status
	if (currentProvider === "gemini") {
		onProviderChange?.();
	}
}

async function handleOpenAIApiKeyChange() {
	const newKey = openaiApiKey.trim() || null;
	const oldKey = await getOpenAIApiKey();

	// Only proceed if the key actually changed
	if (newKey === oldKey) {
		return;
	}

	// Save the key even if it's empty (to clear it)
	await setOpenAIApiKey(newKey);

	// If OpenAI is the current provider, trigger provider change to update status
	if (currentProvider === "openai") {
		onProviderChange?.();
	}
}

async function handleOpenAIBaseUrlChange() {
	const newUrl = openaiBaseUrl.trim() || null;
	const oldUrl = await getOpenAIBaseUrl();

	// Only proceed if the URL actually changed
	if (newUrl === oldUrl) {
		return;
	}

	// Save the URL even if it's empty (to clear it)
	await setOpenAIBaseUrl(newUrl);

	// If OpenAI is the current provider, trigger provider change to update status
	if (currentProvider === "openai") {
		onProviderChange?.();
	}
}

async function handleOpenAIModelChange() {
	const newModel = openaiModel.trim() || null;
	const oldModel = await getOpenAIModel();

	// Only proceed if the model actually changed
	if (newModel === oldModel) {
		return;
	}

	// Save the model even if it's empty (to clear it)
	await setOpenAIModel(newModel);

	// If OpenAI is the current provider, trigger provider change to update status
	if (currentProvider === "openai") {
		onProviderChange?.();
	}
}

function handlePromptChange() {
	onPromptsChange?.({
		system: editableProfilePrompt,
		workflow: editableWorkflowPrompt,
		chunk: editableChunkPrompt,
		merge: editableMergePrompt,
	});
}

function resetPrompts() {
	editableProfilePrompt = USER_PROFILE_SYSTEM_PROMPT;
	editableWorkflowPrompt = WORKFLOW_PATTERNS_SYSTEM_PROMPT;
	editableChunkPrompt = CHUNK_SYSTEM_PROMPT;
	editableMergePrompt = MERGE_SYSTEM_PROMPT;
	handlePromptChange();
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

	const date = autoAnalysisSettings.lastRunTimestamp;
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
												{:else if provider === "openai"}
													OpenAI-compatible API (supports local LLMs via Ollama, LM Studio, etc.)
												{/if}
											</div>
										</div>
									</div>
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

					{#if currentProvider === "openai"}
						<OpenAIProviderSettings
							provider={remoteProviderConfigs.openai}
							bind:apiKey={openaiApiKey}
							bind:baseUrl={openaiBaseUrl}
							bind:model={openaiModel}
							bind:showApiKey
							onApiKeyChange={handleOpenAIApiKeyChange}
							onBaseUrlChange={handleOpenAIBaseUrlChange}
							onModelChange={handleOpenAIModelChange}
						/>
					{/if}

					<!-- Current Status -->
					<div class="p-3 bg-gray-50 rounded-lg">
						<div class="text-sm">
							<span class="font-medium text-gray-700">Current Provider: </span>
							<span class="text-gray-900">{getProviderDisplayName(currentProvider)}</span>
							<span class={`ml-2 text-xs font-medium ${getStatusColor(formatProviderStatus(aiStatus))}`}>
								({formatProviderStatus(aiStatus)})
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
							bind:value={editableProfilePrompt}
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
								<pre class="text-xs text-gray-600 overflow-x-auto">{JSON.stringify(toJSONSchema(UserProfileSchema), null, 2)}</pre>
							</div>
						{/if}
					</div>
					
					<!-- Workflow Patterns Prompt -->
					<div>
						<div class="flex items-center justify-between mb-2">
							<label for="workflow-prompt" class="block text-sm font-medium text-gray-700">
								Workflow Patterns System Prompt
							</label>
							<button
								type="button"
								onclick={() => showWorkflowSchema = !showWorkflowSchema}
								class="text-xs text-blue-600 hover:text-blue-800"
							>
								{showWorkflowSchema ? 'Hide' : 'Show'} Expected Output Schema
							</button>
						</div>
						<textarea
							id="workflow-prompt"
							bind:value={editableWorkflowPrompt}
							oninput={handlePromptChange}
							rows="4"
							class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
							placeholder="Enter custom workflow patterns prompt..."
						></textarea>
						<p class="mt-1 text-xs text-gray-500">
							This prompt guides the AI when analyzing browsing history to identify recurring workflow patterns and automation opportunities.
						</p>
						{#if showWorkflowSchema}
							<div class="mt-2 p-3 bg-gray-100 rounded-md">
								<p class="text-xs font-medium text-gray-700 mb-1">Expected Output Schema:</p>
								<pre class="text-xs text-gray-600 overflow-x-auto">{JSON.stringify(toJSONSchema(WorkflowPatternsOnlySchema), null, 2)}</pre>
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
								<pre class="text-xs text-gray-600 overflow-x-auto">{JSON.stringify(toJSONSchema(ChunkSchema), null, 2)}</pre>
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
								<pre class="text-xs text-gray-600 overflow-x-auto">{JSON.stringify(toJSONSchema(UserProfileSchema), null, 2)}</pre>
								<p class="mt-2 text-xs text-gray-500">Note: The merge operation typically uses the UserProfile schema.</p>
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
