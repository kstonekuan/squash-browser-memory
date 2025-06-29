<script lang="ts">
import {
	getClaudeApiKey,
	loadAIConfig,
	saveAIConfig,
	setClaudeApiKey,
} from "../utils/ai-config";
import type { AIProviderType } from "../utils/ai-interface";
import {
	getAvailableProviders,
	getProvider,
	getProviderDisplayName,
} from "../utils/ai-provider-factory";
import {
	DEFAULT_CHUNK_SYSTEM_PROMPT,
	DEFAULT_SYSTEM_PROMPT,
} from "../utils/constants";
import { ANALYSIS_SCHEMA, CHUNK_SCHEMA } from "../utils/schemas";

let { onPromptsChange } = $props<{
	onPromptsChange?: (prompts: { system: string; chunk: string }) => void;
}>();

let showPrompts = $state(false);
let showAIProvider = $state(false);
let editableSystemPrompt = $state(DEFAULT_SYSTEM_PROMPT);
let editableChunkPrompt = $state(DEFAULT_CHUNK_SYSTEM_PROMPT);
let showAnalysisSchema = $state(false);
let showChunkSchema = $state(false);

// AI Provider state
let currentProvider = $state<AIProviderType>("chrome");
let claudeApiKey = $state("");
let showApiKey = $state(false);
let providerStatus = $state<Record<AIProviderType, string>>({
	chrome: "Unknown",
	claude: "Unknown",
});

// Load current configuration on mount
(async () => {
	const config = await loadAIConfig();
	currentProvider = config.provider;
	claudeApiKey = (await getClaudeApiKey()) || "";

	// Check provider statuses
	await updateProviderStatuses();
})();

async function updateProviderStatuses() {
	const providers: AIProviderType[] = ["chrome", "claude"];

	for (const providerType of providers) {
		try {
			const config = await loadAIConfig();
			if (providerType === "claude") {
				config.claudeApiKey = claudeApiKey;
			}

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
	const config = await loadAIConfig();
	config.provider = provider;
	await saveAIConfig(config);
	await updateProviderStatuses();
}

async function handleApiKeyChange() {
	if (claudeApiKey.trim()) {
		await setClaudeApiKey(claudeApiKey.trim());
	}
	await updateProviderStatuses();
}

function handlePromptChange() {
	onPromptsChange?.({
		system: editableSystemPrompt,
		chunk: editableChunkPrompt,
	});
}

function resetPrompts() {
	editableSystemPrompt = DEFAULT_SYSTEM_PROMPT;
	editableChunkPrompt = DEFAULT_CHUNK_SYSTEM_PROMPT;
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
</script>

<div class="space-y-4">
	<!-- AI Provider Selection -->
	<div class="border border-gray-200 rounded-lg">
		<button
			type="button"
			onclick={() => showAIProvider = !showAIProvider}
			class="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors rounded-t-lg"
		>
			<span class="font-medium text-gray-700">AI Provider Settings</span>
			<svg 
				class={`w-5 h-5 text-gray-500 transition-transform ${showAIProvider ? 'rotate-180' : ''}`}
				fill="none" 
				stroke="currentColor" 
				viewBox="0 0 24 24"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>
		
		{#if showAIProvider}
			<div class="p-4 border-t border-gray-200">
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
								Get your API key from <a href="https://console.anthropic.com/" target="_blank" class="text-blue-600 hover:text-blue-800">Anthropic Console</a>
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
			</div>
		{/if}
	</div>

	<!-- Prompt Customization Section -->
	<div class="border border-gray-200 rounded-lg">
		<button
			type="button"
			onclick={() => showPrompts = !showPrompts}
			class="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors rounded-t-lg"
		>
			<span class="font-medium text-gray-700">Customize AI Prompts</span>
			<svg 
				class={`w-5 h-5 text-gray-500 transition-transform ${showPrompts ? 'rotate-180' : ''}`}
				fill="none" 
				stroke="currentColor" 
				viewBox="0 0 24 24"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>
		
		{#if showPrompts}
			<div class="p-4 border-t border-gray-200">
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
					
					<div class="flex justify-end">
						<button
							onclick={resetPrompts}
							class="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
						>
							Reset to defaults
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>