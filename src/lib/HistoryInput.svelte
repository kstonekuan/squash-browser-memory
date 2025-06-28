<script lang="ts">
import { createEventDispatcher } from "svelte";
import type { AIProvider, ChromeHistoryItem } from "../types";
import {
	analyzeHistory,
	analyzeHistoryText,
	analyzeStandardizedData,
	parseToStandardFormat,
} from "../utils/analyzer";

let {
	apiKey,
	provider,
	isAnalyzing = $bindable(false),
} = $props<{
	apiKey: string;
	provider: AIProvider;
	isAnalyzing?: boolean;
}>();

const dispatch = createEventDispatcher();

let fileInput = $state<HTMLInputElement>();
let error = $state("");
let inputMethod: "file" | "text" = $state("file");
let textInput = $state("");

function emitAnalysisRequest(input: string, type: "text" | "json") {
	dispatch("analysis-request", { input, type });
}

async function handleFileUpload(event: Event) {
	const target = event.target as HTMLInputElement;
	const file = target.files?.[0];

	if (!file) return;

	if (!apiKey) {
		error = "Please enter your API key first.";
		return;
	}

	try {
		const text = await file.text();
		error = "";
		emitAnalysisRequest(text, "json");
	} catch (err) {
		error = "Failed to read file";
	}
}

async function handleTextSubmit() {
	if (!textInput.trim()) {
		error = "Please paste your Chrome history data";
		return;
	}

	if (!apiKey) {
		error = "Please enter your API key first.";
		return;
	}

	error = "";
	emitAnalysisRequest(textInput, "text");
}
</script>

<div class="space-y-4">
  <!-- Input Method Toggle -->
  <div>
    <p class="block text-sm font-medium text-gray-700 mb-2">
      Choose Input Method
    </p>
    <div class="grid grid-cols-2 gap-4">
      <button
        type="button"
        onclick={() => { inputMethod = 'file'; error = ''; }}
        class={`px-4 py-2 rounded-lg border-2 transition-colors flex items-center justify-center gap-2 ${
          inputMethod === 'file' 
            ? 'border-blue-500 bg-blue-50 text-blue-700' 
            : 'border-gray-300 hover:border-gray-400 text-gray-700'
        }`}
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        Upload File
      </button>
      
      <button
        type="button"
        onclick={() => { inputMethod = 'text'; error = ''; }}
        class={`px-4 py-2 rounded-lg border-2 transition-colors flex items-center justify-center gap-2 ${
          inputMethod === 'text' 
            ? 'border-blue-500 bg-blue-50 text-blue-700' 
            : 'border-gray-300 hover:border-gray-400 text-gray-700'
        }`}
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Paste Text
      </button>
    </div>
  </div>

  <!-- File Upload UI -->
  {#if inputMethod === 'file'}
    <div>
      <p class="block text-sm font-medium text-gray-700 mb-2">
        Upload Chrome History Export
      </p>
      <div class="flex items-center justify-center w-full">
        <label for="file-upload" class="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
          <div class="flex flex-col items-center justify-center pt-5 pb-6">
            <svg class="w-10 h-10 mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p class="mb-2 text-sm text-gray-500">
              <span class="font-semibold">Click to upload</span> or drag and drop
            </p>
            <p class="text-xs text-gray-500">JSON file from Chrome history export</p>
          </div>
          <input
            id="file-upload"
            type="file"
            accept=".json"
            class="hidden"
            bind:this={fileInput}
            onchange={handleFileUpload}
            disabled={isAnalyzing}
          />
        </label>
      </div>
    </div>
  {/if}

  <!-- Text Input UI -->
  {#if inputMethod === 'text'}
    <div>
      <p class="block text-sm font-medium text-gray-700 mb-2">
        Paste Chrome History
      </p>
      <textarea
        bind:value={textInput}
        placeholder='Copy and paste your browsing history from chrome://history

Example:
10:45 AM   GitHub - microsoft/vscode
github.com

10:30 AM   Stack Overflow - How to...
stackoverflow.com/questions/...'
        class="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
        disabled={isAnalyzing}
      ></textarea>
      <button
        type="button"
        onclick={handleTextSubmit}
        disabled={isAnalyzing || !textInput.trim()}
        class="mt-3 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
      >
        Analyze History
      </button>
    </div>
  {/if}
  
  {#if error}
    <div class="bg-red-50 border border-red-200 rounded-lg p-4">
      <p class="text-sm text-red-800">{error}</p>
    </div>
  {/if}
  
  {#if isAnalyzing}
    <div class="flex items-center justify-center py-8">
      <div class="flex items-center space-x-2">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span class="text-gray-600">Analyzing your browsing patterns...</span>
      </div>
    </div>
  {/if}
  
  <div class="bg-gray-50 rounded-lg p-4">
    <h3 class="text-sm font-medium text-gray-700 mb-2">
      {inputMethod === 'file' ? 'How to export Chrome history:' : 'How to copy Chrome history:'}
    </h3>
    {#if inputMethod === 'file'}
      <ol class="text-sm text-gray-600 space-y-1 list-decimal list-inside">
        <li>Install a Chrome history export extension</li>
        <li>Click the extension and select "Export as JSON"</li>
        <li>Save the file and upload it here</li>
      </ol>
    {:else}
      <ol class="text-sm text-gray-600 space-y-1 list-decimal list-inside">
        <li>Go to chrome://history in your browser</li>
        <li>Select the history entries you want to analyze (Ctrl+A for all)</li>
        <li>Copy the selected text (Ctrl+C)</li>
        <li>Paste it in the text area above</li>
      </ol>
    {/if}
  </div>
</div>