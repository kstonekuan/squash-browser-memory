<script lang="ts">
import type { AIProviderType } from "../utils/ai-interface";

interface RemoteProviderConfig {
	type: AIProviderType;
	name: string;
	placeholder: string;
	consoleUrl: string;
	consoleName: string;
	colorClass?: string;
}

let {
	provider,
	apiKey = $bindable(""),
	showApiKey = $bindable(false),
	onApiKeyChange,
}: {
	provider: RemoteProviderConfig;
	apiKey: string;
	showApiKey: boolean;
	onApiKeyChange: () => void;
} = $props();
</script>

<div class="p-3 {provider.colorClass || 'bg-blue-50 border-blue-200'} border rounded-lg">
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
		placeholder={provider.placeholder}
		class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
	/>
	<p class="mt-1 text-xs text-gray-600">
		Get your API key from <a href={provider.consoleUrl} target="_blank" class="text-blue-600 hover:text-blue-800" rel="noopener">{provider.consoleName}</a>
	</p>
</div>