<script lang="ts">
import { format } from "date-fns";
import { onMount } from "svelte";
import { match } from "ts-pattern";
import type { AnalysisMemory, MemorySettings } from "../types";
import { loadMemoryFromStorage } from "../utils/memory";
import CollapsibleSection from "./CollapsibleSection.svelte";

type Props = {
	autoExpand?: boolean;
	memorySettings?: MemorySettings;
};

const { autoExpand = false, memorySettings }: Props = $props();

let showMemory = $state(autoExpand);
let sectionIsOpen = $state(autoExpand);
let tooltip = $state<{
	show: boolean;
	text: string;
	x: number;
	y: number;
	align: "center" | "left" | "right";
}>({
	show: false,
	text: "",
	x: 0,
	y: 0,
	align: "center",
});
let memory = $state<AnalysisMemory | null>(null);
let loading = $state(false);
let hasAttemptedLoad = $state(false);
let activeTab = $state<"profile" | "patterns">("profile");

// Reset to profile tab if patterns are disabled and current tab is patterns
$effect(() => {
	if (
		activeTab === "patterns" &&
		memorySettings?.storeWorkflowPatterns === false
	) {
		activeTab = "profile";
	}
});

// Load memory when component mounts or when section is opened
async function loadMemoryData() {
	if (hasAttemptedLoad) return; // Already attempted to load

	loading = true;
	hasAttemptedLoad = true;
	try {
		console.log("[MemoryViewer] Loading memory from storage...");
		memory = await loadMemoryFromStorage();
		console.log("[MemoryViewer] Memory loaded:", {
			hasMemory: !!memory,
			patterns: memory?.patterns?.length || 0,
			lastAnalyzed: memory?.lastAnalyzedDate,
			userProfile: {
				coreIdentities:
					memory?.userProfile?.stableTraits?.coreIdentities?.length || 0,
				currentTasks:
					memory?.userProfile?.dynamicContext?.currentTasks?.length || 0,
			},
		});
	} catch (error) {
		console.error("[MemoryViewer] Failed to load memory:", error);
	} finally {
		loading = false;
	}
}

// Listen for storage changes to automatically refresh memory
onMount(() => {
	// Load memory on mount
	loadMemoryData();

	const handleStorageChange = (changes: {
		[key: string]: chrome.storage.StorageChange;
	}) => {
		// Check if the memory key changed
		if (changes.history_analysis_memory) {
			console.log("[MemoryViewer] Memory updated in storage, refreshing...", {
				oldValue: changes.history_analysis_memory.oldValue,
				newValue: changes.history_analysis_memory.newValue,
			});
			refreshMemory();
		}
	};

	// Listen to chrome storage changes
	if (chrome?.storage?.onChanged) {
		chrome.storage.onChanged.addListener(handleStorageChange);

		// Cleanup listener on component destroy
		return () => {
			chrome.storage.onChanged.removeListener(handleStorageChange);
		};
	}
});

// Refresh memory data
async function refreshMemory() {
	console.log("[MemoryViewer] Manual refresh triggered");
	loading = true;
	try {
		memory = await loadMemoryFromStorage();
		// Force refresh next time if memory section is toggled
		hasAttemptedLoad = true; // Mark as loaded so we show current state
		console.log("[MemoryViewer] Memory refreshed:", {
			hasMemory: !!memory,
			patterns: memory?.patterns?.length || 0,
		});
	} catch (error) {
		console.error("[MemoryViewer] Failed to refresh memory:", error);
	} finally {
		loading = false;
	}
}

function formatDate(date: Date | string | number): string {
	// Handle various date formats
	let dateObj: Date;

	if (!date) {
		return "Never";
	}

	if (date instanceof Date) {
		dateObj = date;
	} else if (typeof date === "string") {
		dateObj = new Date(date);
	} else if (typeof date === "number") {
		dateObj = new Date(date);
	} else {
		return "Never";
	}

	if (!dateObj || Number.isNaN(dateObj.getTime())) {
		return "Never";
	}

	// If the date is the epoch (Unix time 0), show "Never"
	if (dateObj.getTime() === 0) {
		return "Never";
	}

	return format(dateObj, "PPpp");
}

function getAutomationPotentialColor(
	potential: "high" | "medium" | "low",
): string {
	return match(potential)
		.with("high", () => "text-green-600 bg-green-50")
		.with("medium", () => "text-yellow-600 bg-yellow-50")
		.with("low", () => "text-red-600 bg-red-50")
		.exhaustive();
}

// Helper function to truncate text if it's too long
function truncateText(text: string): string {
	const words = text.split(" ");

	// If text is longer than 36 characters OR more than 3 words, truncate it
	if (text.length > 36 || words.length > 3) {
		// Take first 2 words or first 24 characters, whichever is shorter
		const firstTwoWords = words.slice(0, 2).join(" ");
		if (firstTwoWords.length <= 24) {
			return `${firstTwoWords}…`;
		} else {
			// If even 2 words are too long, truncate to 24 chars
			return `${text.substring(0, 24)}…`;
		}
	}

	return text;
}

// Tooltip functions
function showTooltip(event: MouseEvent, text: string) {
	const target = event.target as HTMLElement;
	const rect = target.getBoundingClientRect();
	const viewportWidth = window.innerWidth;

	// Estimate tooltip width (rough calculation based on text length)
	const estimatedTooltipWidth = Math.min(text.length * 8 + 16, 288); // max 288px (max-w-xs = 20rem = 320px - padding)

	// Calculate ideal center position
	const pillCenterX = rect.left + rect.width / 2;

	// Determine positioning strategy
	let tooltipX = pillCenterX;
	let align: "center" | "left" | "right" = "center";

	// Check if centered tooltip would go off the left edge
	if (pillCenterX - estimatedTooltipWidth / 2 < 8) {
		// Align to left edge with margin
		tooltipX = 8;
		align = "left";
	}
	// Check if centered tooltip would go off the right edge
	else if (pillCenterX + estimatedTooltipWidth / 2 > viewportWidth - 8) {
		// Align to right edge with margin
		tooltipX = viewportWidth - 8;
		align = "right";
	}

	tooltip.text = text;
	tooltip.x = tooltipX;
	tooltip.y = rect.top - 5;
	tooltip.align = align;
	tooltip.show = true;
}

function hideTooltip() {
	tooltip.show = false;
}

// Load memory when showing for first time
$effect(() => {
	if (sectionIsOpen && !hasAttemptedLoad && !loading) {
		loadMemoryData();
	}
});

// Handle section toggle
function handleSectionToggle(isOpen: boolean) {
	sectionIsOpen = isOpen;
	if (isOpen && !loading) {
		// Always try to load when opening, reset the flag
		hasAttemptedLoad = false;
		loadMemoryData();
	}
}

function getMemoryBadge(): string {
	if (loading) return "Loading...";
	if (!memory) return "";

	// Hide pattern count when workflow patterns are disabled
	if (memorySettings?.storeWorkflowPatterns === false) {
		return "Profile data";
	}

	return `${memory.patterns.length} patterns`;
}
</script>

<CollapsibleSection title="Memory" defaultOpen={showMemory} badge={getMemoryBadge()} onToggle={handleSectionToggle}>
			<!-- MCP Server Feature (Coming Soon) -->
			<div class="p-4 border-b border-gray-200 bg-gray-50">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-3">
						<button
							disabled
							class="px-4 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed flex items-center gap-2"
							title="Soon you'll be able to expose your browsing patterns and profile as an MCP server for other tools to use"
						>
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
							</svg>
							MCP Server
						</button>
						<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
							Coming Soon
						</span>
					</div>
					<div class="text-xs text-gray-500 max-w-xs text-right">
						Enable AI agents to access your browser memory
					</div>
				</div>
			</div>
			
			{#if loading}
				<div class="p-6 text-center">
					<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
					<p class="mt-2 text-sm text-gray-600">Loading your profile...</p>
				</div>
			{:else if !memory}
				<div class="p-6 text-center">
					<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
					</svg>
					<p class="mt-4 text-lg font-medium text-gray-900">No Profile Data Yet</p>
					<p class="mt-2 text-sm text-gray-600">
						Run an analysis on your browsing history to start building your profile.
					</p>
				</div>
			{:else}
				<div class="p-4 space-y-4">
					<!-- Header with stats and refresh -->
					<div class="flex items-center justify-between">
						<div class="text-sm text-gray-600">
							<p><strong>Last Updated:</strong> {formatDate(memory.lastAnalyzedDate)}</p>
						</div>
						<button
							onclick={refreshMemory}
							class="px-3 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
						>
							Refresh
						</button>
					</div>


					<!-- Tab Navigation -->
					<div class="border-b border-gray-200">
						<nav class="-mb-px flex space-x-8">
							<button
								onclick={() => activeTab = 'profile'}
								class={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
									activeTab === 'profile'
										? 'border-blue-500 text-blue-600'
										: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
								}`}
							>
								User Profile
							</button>
							{#if memorySettings?.storeWorkflowPatterns !== false}
								<button
									onclick={() => activeTab = 'patterns'}
									class={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
										activeTab === 'patterns'
											? 'border-blue-500 text-blue-600'
											: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
									}`}
								>
									Workflow Patterns
									{#if memory.patterns.length > 0}
										<span class="ml-2 bg-gray-100 text-gray-900 py-0.5 px-2 rounded-full text-xs">
											{memory.patterns.length}
										</span>
									{/if}
								</button>
							{/if}
						</nav>
					</div>

					<!-- Tab Content -->
					{#if activeTab === 'profile'}
						<!-- User Profile Tab -->
						<div class="grid gap-4">
							<!-- Profile Summary -->
							{#if memory.userProfile.summary}
								<div class="border border-blue-200 rounded-lg p-4 bg-blue-50">
									<div class="flex items-center mb-3">
										<svg class="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
										</svg>
										<h3 class="text-lg font-semibold text-blue-700">Profile Summary</h3>
									</div>
									<p class="text-sm text-blue-800 leading-relaxed">
										{memory.userProfile.summary}
									</p>
								</div>
							{/if}
							<!-- About Me Card (Stable Background) -->
							<div class="border border-gray-200 rounded-lg p-4 bg-gray-50">
								<div class="flex items-center mb-3">
									<svg class="w-5 h-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
									</svg>
									<h3 class="text-lg font-semibold text-gray-700">About Me</h3>
									<span class="ml-2 text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded-full">Core Identity</span>
								</div>
								
								<!-- Core Identities -->
								{#if memory.userProfile.stableTraits.coreIdentities.length > 0}
									<div class="mb-3">
										<h4 class="text-sm font-medium text-gray-600 mb-2">Core Identities</h4>
										<div class="flex flex-wrap gap-1">
											{#each memory.userProfile.stableTraits.coreIdentities as identity}
												<span 
													class="inline-block px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full cursor-pointer hover:bg-green-200 transition-colors" 
													role="button"
													tabindex="0"
													onmouseenter={(e) => showTooltip(e, identity)}
													onmouseleave={hideTooltip}
												>
													{truncateText(identity)}
												</span>
											{/each}
										</div>
									</div>
								{/if}


								<!-- Personal Preferences -->
								{#if memory.userProfile.stableTraits.personalPreferences.length > 0}
									<div class="mb-3">
										<h4 class="text-sm font-medium text-gray-600 mb-2">Personal Preferences</h4>
										<div class="flex flex-wrap gap-1">
											{#each memory.userProfile.stableTraits.personalPreferences as pref}
												<span 
													class="inline-block px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded-full cursor-pointer hover:bg-gray-300 transition-colors" 
													role="button"
													tabindex="0"
													onmouseenter={(e) => showTooltip(e, `${pref.category}: ${pref.preference}`)}
													onmouseleave={hideTooltip}
												>
													{truncateText(pref.preference)}
												</span>
											{/each}
										</div>
									</div>
								{/if}
							</div>

							<!-- Current Focus Card (Dynamic Context) -->
							<div class="border border-orange-200 rounded-lg p-4 bg-orange-50">
								<div class="flex items-center mb-3">
									<svg class="w-5 h-5 text-orange-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
									</svg>
									<h3 class="text-lg font-semibold text-orange-700">Current Focus</h3>
									<span class="ml-2 text-xs text-orange-600 bg-orange-200 px-2 py-1 rounded-full">Active Now</span>
								</div>

								<!-- Current Tasks -->
								{#if memory.userProfile.dynamicContext.currentTasks.length > 0}
									<div class="mb-3">
										<h4 class="text-sm font-medium text-orange-700 mb-2">Current Tasks</h4>
										<div class="flex flex-wrap gap-1">
											{#each memory.userProfile.dynamicContext.currentTasks as task}
												<span 
													class="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full cursor-pointer hover:bg-blue-200 transition-colors" 
													role="button"
													tabindex="0"
													onmouseenter={(e) => showTooltip(e, task)}
													onmouseleave={hideTooltip}
												>
													{truncateText(task)}
												</span>
											{/each}
										</div>
									</div>
								{/if}

								<!-- Current Interests -->
								{#if memory.userProfile.dynamicContext.currentInterests.length > 0}
									<div class="mb-3">
										<h4 class="text-sm font-medium text-orange-700 mb-2">Current Interests</h4>
										<div class="flex flex-wrap gap-1">
											{#each memory.userProfile.dynamicContext.currentInterests as interest}
												<span 
													class="inline-block px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full cursor-pointer hover:bg-purple-200 transition-colors" 
													role="button"
													tabindex="0"
													onmouseenter={(e) => showTooltip(e, interest)}
													onmouseleave={hideTooltip}
												>
													{truncateText(interest)}
												</span>
											{/each}
										</div>
									</div>
								{/if}

							</div>
						</div>
					{:else if activeTab === 'patterns' && memorySettings?.storeWorkflowPatterns !== false}
						<!-- Workflow Patterns Tab -->
						{#if memory.patterns.length > 0}
							<div class="space-y-3">
								{#each memory.patterns as pattern}
									<div class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
										<div class="flex items-start justify-between mb-2">
											<div class="flex-1">
												<h4 class="text-sm font-medium text-gray-900">{pattern.pattern}</h4>
												<p class="text-xs text-gray-600 mt-1">{pattern.description}</p>
											</div>
											<div class="flex items-center space-x-2 ml-4">
												<span class="text-xs text-gray-500">×{pattern.frequency}</span>
												<span class={`px-2 py-1 text-xs rounded-full ${getAutomationPotentialColor(pattern.automationPotential)}`}>
													{pattern.automationPotential}
												</span>
											</div>
										</div>
										{#if pattern.timePattern}
											<p class="text-xs text-blue-600 mb-2">⏰ {pattern.timePattern}</p>
										{/if}
										{#if pattern.suggestion}
											<p class="text-xs text-gray-700 bg-yellow-50 p-2 rounded border-l-2 border-yellow-400">
												💡 {pattern.suggestion}
											</p>
										{/if}
										{#if pattern.urls.length > 0}
											<details class="mt-2">
												<summary class="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
													Show URLs ({pattern.urls.length})
												</summary>
												<div class="mt-1 space-y-1">
													{#each pattern.urls.slice(0, 5) as url}
														<p class="text-xs text-gray-600 truncate">{url}</p>
													{/each}
													{#if pattern.urls.length > 5}
														<p class="text-xs text-gray-500">...and {pattern.urls.length - 5} more</p>
													{/if}
												</div>
											</details>
										{/if}
									</div>
								{/each}
							</div>
						{:else}
							<div class="text-center py-8">
								<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
								</svg>
								<p class="mt-4 text-sm text-gray-600">No workflow patterns discovered yet.</p>
								<p class="text-xs text-gray-500">Analyze more browsing history to discover patterns.</p>
							</div>
						{/if}
					{/if}
				</div>
			{/if}
</CollapsibleSection>

<!-- Custom Tooltip -->
{#if tooltip.show}
	{@const transformClass = 
		tooltip.align === 'left' ? 'translateY(-100%)' :
		tooltip.align === 'right' ? 'translateX(-100%) translateY(-100%)' :
		'translateX(-50%) translateY(-100%)'
	}
	<div 
		class="fixed z-50 px-3 py-2 text-xs text-white bg-gray-900 rounded-md shadow-lg pointer-events-none max-w-xs break-words"
		style="left: {tooltip.x}px; top: {tooltip.y}px; transform: {transformClass}; margin-top: -8px;"
	>
		{tooltip.text}
	</div>
{/if}