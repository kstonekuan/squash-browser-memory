<script lang="ts">
import type { AIProvider } from "../types";

let { provider = $bindable("gemini" as AIProvider), apiKey = $bindable("") } =
	$props();

let showKey = $state(false);
</script>

<div class="space-y-4">
  <fieldset>
    <legend class="block text-sm font-medium text-gray-700 mb-2">
      AI Provider
    </legend>
    <div class="grid grid-cols-2 gap-4">
      <button
        type="button"
        onclick={() => provider = 'gemini'}
        class={`px-4 py-2 rounded-lg border-2 transition-colors ${
          provider === 'gemini' 
            ? 'border-blue-500 bg-blue-50 text-blue-700' 
            : 'border-gray-300 hover:border-gray-400 text-gray-700'
        }`}
      >
        <div class="font-medium">Google Gemini</div>
        <div class="text-xs mt-1">Gemini 2.5 Flash</div>
      </button>
      
      <button
        type="button"
        onclick={() => provider = 'openai'}
        class={`px-4 py-2 rounded-lg border-2 transition-colors ${
          provider === 'openai' 
            ? 'border-blue-500 bg-blue-50 text-blue-700' 
            : 'border-gray-300 hover:border-gray-400 text-gray-700'
        }`}
      >
        <div class="font-medium">OpenAI</div>
        <div class="text-xs mt-1">GPT-4.1-mini</div>
      </button>
    </div>
  </fieldset>

  <div>
    <label for="api-key" class="block text-sm font-medium text-gray-700 mb-2">
      {provider === 'openai' ? 'OpenAI' : 'Google'} API Key
    </label>
    <div class="relative">
      <input
        id="api-key"
        type={showKey ? 'text' : 'password'}
        bind:value={apiKey}
        placeholder={provider === 'openai' ? 'sk-...' : 'AIza...'}
        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
      <button
        type="button"
        onclick={() => showKey = !showKey}
        class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
      >
        {showKey ? 'Hide' : 'Show'}
      </button>
    </div>
    <p class="mt-1 text-xs text-gray-500">
      Your API key is never stored and is only used for this session.
      {#if provider === 'gemini'}
        <a href="https://aistudio.google.com/apikey" target="_blank" class="text-blue-600 hover:underline">
          Get a Gemini API key
        </a>
      {/if}
    </p>
  </div>
</div>