<script lang="ts">
import { createEventDispatcher, onMount } from "svelte";
import type { PlatformType } from "../utils/platform-adapter";
import {
	type ContextSuggestion,
	getSimpleContextMatcher,
} from "../utils/simple-context-matcher";

export let platform: PlatformType = "generic";
export let currentInput = "";
export let isVisible = false;
export let maxSuggestions = 5;

const dispatch = createEventDispatcher<{
	select: { text: string; suggestion: ContextSuggestion };
	close: undefined;
	toggle: undefined;
}>();

let suggestions: ContextSuggestion[] = [];
let loading = false;
let error = "";
let selectedIndex = -1;
let containerElement: HTMLDivElement;

const matcher = getSimpleContextMatcher();

// Initialize matcher and load suggestions
onMount(async () => {
	try {
		await matcher.initialize();
	} catch (err) {
		console.error("Failed to initialize context matcher:", err);
		error = "Failed to load context matching";
	}
});

// Reactive statement to update suggestions when input changes
$: if (currentInput && currentInput.trim().length >= 3) {
	updateSuggestions(currentInput);
} else {
	suggestions = [];
	selectedIndex = -1;
}

async function updateSuggestions(input: string) {
	if (!input || input.trim().length < 3) {
		suggestions = [];
		return;
	}

	loading = true;
	error = "";

	try {
		suggestions = await matcher.getSuggestions(input.trim(), maxSuggestions);
		selectedIndex = -1;
	} catch (err) {
		console.error("Failed to get suggestions:", err);
		error = "Failed to get context suggestions";
		suggestions = [];
	} finally {
		loading = false;
	}
}

function selectSuggestion(suggestion: ContextSuggestion) {
	dispatch("select", { text: suggestion.text, suggestion });
	closeSuggestions();
}

function closeSuggestions() {
	isVisible = false;
	selectedIndex = -1;
	dispatch("close");
}

function toggleSuggestions() {
	isVisible = !isVisible;
	if (isVisible && currentInput) {
		updateSuggestions(currentInput);
	}
	dispatch("toggle");
}

// Keyboard navigation
function handleKeydown(event: KeyboardEvent) {
	if (!isVisible || suggestions.length === 0) return;

	switch (event.key) {
		case "ArrowDown":
			event.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
			break;
		case "ArrowUp":
			event.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, -1);
			break;
		case "Enter":
			event.preventDefault();
			if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
				selectSuggestion(suggestions[selectedIndex]);
			}
			break;
		case "Escape":
			event.preventDefault();
			closeSuggestions();
			break;
	}
}

// Close suggestions when clicking outside
function handleClickOutside(event: MouseEvent) {
	if (containerElement && !containerElement.contains(event.target as Node)) {
		closeSuggestions();
	}
}

// Add event listeners
onMount(() => {
	document.addEventListener("keydown", handleKeydown);
	document.addEventListener("click", handleClickOutside);

	return () => {
		document.removeEventListener("keydown", handleKeydown);
		document.removeEventListener("click", handleClickOutside);
	};
});

function getCategoryIcon(category: ContextSuggestion["category"]): string {
	switch (category) {
		case "goals":
			return "🎯";
		case "profession":
			return "💼";
		case "patterns":
			return "🔄";
		case "preferences":
			return "⚙️";
		case "traits":
			return "🧠";
		case "interests":
			return "✨";
		case "obsessions":
			return "🔥";
		default:
			return "📝";
	}
}

function getCategoryColor(category: ContextSuggestion["category"]): string {
	switch (category) {
		case "goals":
			return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
		case "profession":
			return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
		case "patterns":
			return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
		case "preferences":
			return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
		case "traits":
			return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200";
		case "interests":
			return "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200";
		case "obsessions":
			return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
		default:
			return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
	}
}

// Check if button should show active state
$: hasRelevantSuggestions = suggestions.length > 0;
</script>

<!-- Context Button -->
<div bind:this={containerElement} class="relative inline-block">
	<button
		type="button"
		class="context-button {platform === 'chatgpt' ? 'chatgpt-style' : 'generic-style'}"
		class:active={hasRelevantSuggestions}
		class:loading={loading}
		aria-label="Add context from memory"
		aria-expanded={isVisible}
		aria-haspopup="listbox"
		on:click={toggleSuggestions}
	>
		<!-- Brain/Context Icon -->
		<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" class="context-icon">
			<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
		</svg>
		
		<!-- Loading indicator -->
		{#if loading}
			<div class="loading-spinner"></div>
		{/if}
		
		<!-- Context label (for platforms that show text) -->
		{#if platform === 'chatgpt'}
			<span class="button-text">Context</span>
		{/if}
		
		<!-- Suggestion count indicator -->
		{#if hasRelevantSuggestions && !isVisible}
			<span class="suggestion-count">{suggestions.length}</span>
		{/if}
	</button>

	<!-- Suggestions Dropdown -->
	{#if isVisible}
		<div class="suggestions-dropdown" role="listbox" aria-label="Context suggestions">
			{#if loading}
				<div class="suggestion-item loading-item">
					<div class="loading-spinner"></div>
					<span>Finding relevant context...</span>
				</div>
			{:else if error}
				<div class="suggestion-item error-item">
					<span class="error-icon">⚠️</span>
					<span>{error}</span>
				</div>
			{:else if suggestions.length === 0}
				<div class="suggestion-item empty-item">
					<span class="empty-icon">💭</span>
					<span>No relevant context found</span>
				</div>
			{:else}
				{#each suggestions as suggestion, index}
					<button
						type="button"
						class="suggestion-item clickable-item"
						class:selected={index === selectedIndex}
						role="option"
						aria-selected={index === selectedIndex}
						on:click={() => selectSuggestion(suggestion)}
						on:mouseenter={() => selectedIndex = index}
					>
						<div class="suggestion-header">
							<span class="category-icon">{getCategoryIcon(suggestion.category)}</span>
							<span class="category-badge {getCategoryColor(suggestion.category)}">
								{suggestion.category}
							</span>
							<span class="relevance-score">
								{Math.round(suggestion.relevanceScore * 100)}%
							</span>
							<span class="match-type-badge {suggestion.matchType}">
								{suggestion.matchType}
							</span>
						</div>
						<div class="suggestion-text">
							{suggestion.text}
						</div>
					</button>
				{/each}
			{/if}
			
			<!-- Footer with status -->
			<div class="suggestions-footer">
				<span class="status-indicator string">📝 String matching</span>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Context Button Styles */
	.context-button {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 8px;
		border: 1px solid #d1d5db;
		border-radius: 18px;
		background: transparent;
		color: #6b7280;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		min-width: 32px;
		height: 36px;
	}

	.context-button:hover {
		background-color: #f9fafb;
		color: #374151;
	}

	.context-button.active {
		border-color: #3b82f6;
		color: #3b82f6;
		background-color: #eff6ff;
	}

	.context-button.loading {
		opacity: 0.8;
	}

	.chatgpt-style {
		border-radius: 18px;
	}

	.generic-style {
		border-radius: 8px;
		padding: 6px;
		border-color: #e5e7eb;
	}

	/* Button Elements */
	.context-icon {
		flex-shrink: 0;
	}

	.button-text {
		white-space: nowrap;
		margin-left: 4px;
		margin-right: 4px;
	}

	.suggestion-count {
		position: absolute;
		top: -4px;
		right: -4px;
		background: #ef4444;
		color: white;
		font-size: 10px;
		font-weight: bold;
		border-radius: 50%;
		width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
	}

	.loading-spinner {
		width: 12px;
		height: 12px;
		border: 2px solid #e5e7eb;
		border-top: 2px solid #3b82f6;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	/* Suggestions Dropdown */
	.suggestions-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		margin-top: 4px;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
		max-height: 400px;
		overflow-y: auto;
		z-index: 1000;
		min-width: 320px;
	}

	.suggestion-item {
		display: block;
		width: 100%;
		padding: 12px;
		border: none;
		background: transparent;
		text-align: left;
		cursor: pointer;
		border-bottom: 1px solid #f3f4f6;
		transition: background-color 0.2s ease;
	}

	.suggestion-item:last-child {
		border-bottom: none;
	}

	.clickable-item:hover,
	.clickable-item.selected {
		background-color: #f9fafb;
	}

	.loading-item,
	.error-item,
	.empty-item {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #6b7280;
		font-style: italic;
		cursor: default;
	}

	.error-item {
		color: #ef4444;
	}

	/* Suggestion Content */
	.suggestion-header {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 6px;
		font-size: 12px;
	}

	.category-icon {
		font-size: 14px;
	}

	.category-badge {
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 10px;
		font-weight: 600;
		text-transform: capitalize;
	}

	.relevance-score {
		margin-left: auto;
		color: #6b7280;
		font-weight: 500;
	}

	.match-type-badge {
		padding: 1px 4px;
		border-radius: 3px;
		font-size: 9px;
		font-weight: 600;
		text-transform: uppercase;
	}

	.match-type-badge.semantic {
		background: #dcfce7;
		color: #166534;
	}

	.match-type-badge.string {
		background: #fef3c7;
		color: #92400e;
	}

	.suggestion-text {
		color: #374151;
		font-size: 14px;
		line-height: 1.4;
		margin-top: 4px;
	}

	/* Footer */
	.suggestions-footer {
		padding: 8px 12px;
		background: #f9fafb;
		border-top: 1px solid #f3f4f6;
		border-radius: 0 0 12px 12px;
	}

	.status-indicator {
		font-size: 11px;
		color: #6b7280;
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.status-indicator.semantic {
		color: #059669;
	}

	.status-indicator.loading {
		color: #d97706;
	}

	/* Dark mode support */
	@media (prefers-color-scheme: dark) {
		.context-button {
			border-color: #374151;
			color: #9ca3af;
		}

		.context-button:hover {
			background-color: #1f2937;
			color: #d1d5db;
		}

		.context-button.active {
			border-color: #3b82f6;
			color: #3b82f6;
			background-color: #1e3a8a;
		}

		.suggestions-dropdown {
			background: #1f2937;
			border-color: #374151;
		}

		.suggestion-item {
			border-color: #374151;
		}

		.clickable-item:hover,
		.clickable-item.selected {
			background-color: #374151;
		}

		.suggestion-text {
			color: #d1d5db;
		}

		.suggestions-footer {
			background: #111827;
			border-color: #374151;
		}
	}
</style>