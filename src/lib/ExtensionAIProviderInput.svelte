<script lang="ts">
import type { AIProvider } from "../types";
import ChromeAIStatus from "./ChromeAIStatus.svelte";

let { apiKey = $bindable(""), provider = $bindable("gemini") } = $props<{
	apiKey?: string;
	provider?: AIProvider;
}>();

let showKey = $state(false);

// Save to chrome.storage whenever values change
$effect(() => {
	if (chrome?.storage?.local && apiKey) {
		chrome.storage.local.set({ apiKey }, () => {
			console.log("API key saved");
		});
	}
});

$effect(() => {
	if (chrome?.storage?.local && provider) {
		chrome.storage.local.set({ provider }, () => {
			console.log("Provider saved");
		});
	}
});

function toggleKeyVisibility() {
	showKey = !showKey;
}

function clearApiKey() {
	if (confirm("Are you sure you want to clear your API key?")) {
		apiKey = "";
		if (chrome?.storage?.local) {
			chrome.storage.local.remove("apiKey");
		}
	}
}
</script>

<div class="space-y-3">
	<div>
		<label for="ai-provider" class="block text-sm font-medium text-gray-700 mb-1">
			AI Provider
		</label>
		<select
			id="ai-provider"
			bind:value={provider}
			class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
		>
			<option value="chrome">Chrome AI (Local)</option>
			<option value="gemini">Google Gemini</option>
			<option value="openai">OpenAI</option>
		</select>
	</div>

	{#if provider !== 'chrome'}
		<div>
			<div class="flex items-center justify-between mb-1">
				<label for="api-key" class="block text-sm font-medium text-gray-700">
					API Key
				</label>
				{#if apiKey}
					<button
						type="button"
						onclick={clearApiKey}
						class="text-xs text-red-600 hover:text-red-800"
					>
						Clear
					</button>
				{/if}
			</div>
		<div class="relative">
			<input
				id="api-key"
				type={showKey ? "text" : "password"}
				bind:value={apiKey}
				placeholder={`Enter your ${provider === 'openai' ? 'OpenAI' : 'Google Gemini'} API key`}
				class="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
			/>
			<button
				type="button"
				onclick={toggleKeyVisibility}
				class="absolute inset-y-0 right-0 pr-3 flex items-center"
			>
				{#if showKey}
					<svg class="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
					</svg>
				{:else}
					<svg class="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
					</svg>
				{/if}
			</button>
		</div>
		<p class="mt-1 text-xs text-gray-500">
			{#if provider === 'openai'}
				Get your API key from <a 
					href="https://platform.openai.com/account/api-keys" 
					target="_blank" 
					rel="noopener noreferrer"
					class="text-blue-600 hover:text-blue-800"
				>
					OpenAI Platform
				</a>
			{:else}
				Get your API key from <a 
					href="https://makersuite.google.com/app/apikey" 
					target="_blank" 
					rel="noopener noreferrer"
					class="text-blue-600 hover:text-blue-800"
				>
					Google AI Studio
				</a>
			{/if}
		</p>
		</div>

		{#if apiKey}
			<div class="bg-green-50 border border-green-200 rounded-md p-2">
				<p class="text-xs text-green-800">API key saved securely in extension storage</p>
			</div>
		{/if}
	{:else}
		<div class="bg-blue-50 border border-blue-200 rounded-md p-3">
			<p class="text-xs text-blue-800">
				Chrome AI runs completely on your device. No API key needed!
			</p>
			<div class="mt-2">
				<ChromeAIStatus />
			</div>
		</div>
	{/if}
</div>