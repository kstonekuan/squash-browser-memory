<script lang="ts">
import type { AIProviderType } from "../utils/ai-interface";

interface OpenAIProviderConfig {
	type: AIProviderType;
	name: string;
	apiKeyPlaceholder: string;
	baseUrlPlaceholder: string;
	modelPlaceholder: string;
	consoleUrl: string;
	consoleName: string;
	colorClass?: string;
}

type Props = {
	provider: OpenAIProviderConfig;
	apiKey: string;
	baseUrl: string;
	model: string;
	showApiKey: boolean;
	onApiKeyChange: () => void;
	onBaseUrlChange: () => void;
	onModelChange: () => void;
};

let {
	provider,
	apiKey = $bindable(""),
	baseUrl = $bindable(""),
	model = $bindable(""),
	showApiKey = $bindable(false),
	onApiKeyChange,
	onBaseUrlChange,
	onModelChange,
}: Props = $props();
</script>

<div class="p-3 {provider.colorClass || 'bg-green-50 border-green-200'} border rounded-lg">
	<!-- API Key Field -->
	<div class="flex items-center justify-between mb-2">
		<label for="{provider.type}-api-key" class="block text-sm font-medium text-gray-700">
			{provider.name} API Key
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
		id="{provider.type}-api-key"
		type={showApiKey ? "text" : "password"}
		bind:value={apiKey}
		onblur={onApiKeyChange}
		placeholder={provider.apiKeyPlaceholder}
		class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
	/>
	<p class="mt-1 text-xs text-gray-600">
		Get your API key from <a href={provider.consoleUrl} target="_blank" class="text-blue-600 hover:text-blue-800" rel="noopener">{provider.consoleName}</a>
	</p>

	<!-- Base URL Field (Optional) -->
	<div class="mt-4">
		<label for="{provider.type}-base-url" class="block text-sm font-medium text-gray-700 mb-2">
			Custom Base URL (Optional)
		</label>
		<input
			id="{provider.type}-base-url"
			type="url"
			bind:value={baseUrl}
			onblur={onBaseUrlChange}
			placeholder={provider.baseUrlPlaceholder}
			class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
		/>
		<p class="mt-1 text-xs text-gray-600">
			For OpenAI-compatible endpoints (e.g., Azure OpenAI, local LLMs). Leave empty for default OpenAI API.
		</p>
	</div>

	<!-- Model Field -->
	<div class="mt-4">
		<label for="{provider.type}-model" class="block text-sm font-medium text-gray-700 mb-2">
			Model Name
		</label>
		<input
			id="{provider.type}-model"
			type="text"
			bind:value={model}
			onblur={onModelChange}
			placeholder={provider.modelPlaceholder}
			class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
		/>
		<p class="mt-1 text-xs text-gray-600">
			Specify the model to use. Default: gpt-4o-mini
		</p>
	</div>
</div>