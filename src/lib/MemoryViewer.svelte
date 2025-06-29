<script lang="ts">
import { onMount } from "svelte";
import type { AnalysisMemory } from "../utils/memory";
import { loadMemory } from "../utils/memory";

let showMemory = $state(false);
let memory = $state<AnalysisMemory | null>(null);
let loading = $state(false);
let hasAttemptedLoad = $state(false);

// Load memory when component mounts or when section is opened
async function loadMemoryData() {
	if (hasAttemptedLoad) return; // Already attempted to load

	loading = true;
	hasAttemptedLoad = true;
	try {
		memory = await loadMemory();
	} catch (error) {
		console.error("Failed to load memory:", error);
	} finally {
		loading = false;
	}
}

// Listen for storage changes to automatically refresh memory
onMount(() => {
	const handleStorageChange = (changes: {
		[key: string]: chrome.storage.StorageChange;
	}) => {
		// Check if the memory key changed
		if (changes["history_analysis_memory"] && showMemory) {
			console.log("Memory updated in storage, refreshing...");
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
	loading = true;
	try {
		memory = await loadMemory();
		// Force refresh next time if memory section is toggled
		hasAttemptedLoad = false;
	} catch (error) {
		console.error("Failed to refresh memory:", error);
	} finally {
		loading = false;
	}
}

function formatDate(date: Date): string {
	if (!date || Number.isNaN(date.getTime())) {
		return "Never";
	}

	// If the date is the epoch (Unix time 0), show "Never"
	if (date.getTime() === 0) {
		return "Never";
	}

	return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function getAutomationPotentialColor(
	potential: "high" | "medium" | "low",
): string {
	switch (potential) {
		case "high":
			return "text-green-600 bg-green-50";
		case "medium":
			return "text-yellow-600 bg-yellow-50";
		case "low":
			return "text-red-600 bg-red-50";
		default:
			return "text-gray-600 bg-gray-50";
	}
}

function getTechnologyLevelColor(
	level: "beginner" | "intermediate" | "advanced" | "expert",
): string {
	switch (level) {
		case "expert":
			return "text-purple-600 bg-purple-50";
		case "advanced":
			return "text-blue-600 bg-blue-50";
		case "intermediate":
			return "text-green-600 bg-green-50";
		case "beginner":
			return "text-yellow-600 bg-yellow-50";
		default:
			return "text-gray-600 bg-gray-50";
	}
}

// Load memory when showing for first time
$effect(() => {
	if (showMemory && !hasAttemptedLoad && !loading) {
		loadMemoryData();
	}
});
</script>

<div class="border border-gray-200 rounded-lg">
	<button
		type="button"
		onclick={() => showMemory = !showMemory}
		class="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors rounded-t-lg"
	>
		<span class="font-medium text-gray-700">What AI Knows About Me</span>
		<div class="flex items-center space-x-2">
			{#if memory && !loading}
				<span class="text-xs text-gray-500">
					{memory.patterns.length} patterns • {memory.totalItemsAnalyzed} items analyzed
				</span>
			{/if}
			<svg 
				class={`w-5 h-5 text-gray-500 transition-transform ${showMemory ? 'rotate-180' : ''}`}
				fill="none" 
				stroke="currentColor" 
				viewBox="0 0 24 24"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</div>
	</button>
	
	{#if showMemory}
		<div class="border-t border-gray-200">
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
				<div class="p-4 space-y-6">
					<!-- Header with stats and refresh -->
					<div class="flex items-center justify-between">
						<div class="text-sm text-gray-600">
							<p><strong>Last Updated:</strong> {formatDate(memory.lastAnalyzedDate)}</p>
							<p><strong>Items Analyzed:</strong> {memory.totalItemsAnalyzed.toLocaleString()}</p>
						</div>
						<button
							onclick={refreshMemory}
							class="px-3 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
						>
							Refresh
						</button>
					</div>

					<!-- User Profile Section -->
					<div>
						<h3 class="text-lg font-semibold text-gray-900 mb-3">Your Profile</h3>
						
						<!-- Profession -->
						<div class="mb-4">
							<h4 class="text-sm font-medium text-gray-700 mb-2">Profession</h4>
							<span class="inline-block px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-full">
								{memory.userProfile.profession}
							</span>
						</div>

						<!-- Summary -->
						{#if memory.userProfile.summary}
							<div class="mb-4">
								<h4 class="text-sm font-medium text-gray-700 mb-2">Summary</h4>
								<p class="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
									{memory.userProfile.summary}
								</p>
							</div>
						{/if}

						<!-- Interests -->
						{#if memory.userProfile.interests.length > 0}
							<div class="mb-4">
								<h4 class="text-sm font-medium text-gray-700 mb-2">Interests</h4>
								<div class="flex flex-wrap gap-2">
									{#each memory.userProfile.interests as interest}
										<span class="inline-block px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
											{interest}
										</span>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Technology Use -->
						{#if memory.userProfile.technologyUse.length > 0}
							<div class="mb-4">
								<h4 class="text-sm font-medium text-gray-700 mb-2">Technology Skills</h4>
								<div class="space-y-2">
									{#each memory.userProfile.technologyUse as tech}
										<div class="flex items-center justify-between p-2 bg-gray-50 rounded">
											<div>
												<span class="text-sm font-medium text-gray-900">{tech.category}</span>
												{#if tech.tools.length > 0}
													<p class="text-xs text-gray-600">{tech.tools.join(", ")}</p>
												{/if}
											</div>
											<span class={`px-2 py-1 text-xs rounded-full ${getTechnologyLevelColor(tech.level)}`}>
												{tech.level}
											</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Work Patterns -->
						{#if memory.userProfile.workPatterns.length > 0}
							<div class="mb-4">
								<h4 class="text-sm font-medium text-gray-700 mb-2">Work Patterns</h4>
								<div class="space-y-2">
									{#each memory.userProfile.workPatterns as pattern}
										<div class="p-3 bg-gray-50 rounded-lg">
											<p class="text-sm font-medium text-gray-900">{pattern.type}</p>
											<p class="text-xs text-gray-600 mt-1">{pattern.description}</p>
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Personality Traits -->
						{#if memory.userProfile.personalityTraits.length > 0}
							<div class="mb-4">
								<h4 class="text-sm font-medium text-gray-700 mb-2">Personality Traits</h4>
								<div class="space-y-2">
									{#each memory.userProfile.personalityTraits as trait}
										<div class="p-3 bg-gray-50 rounded-lg">
											<p class="text-sm font-medium text-gray-900">{trait.trait}</p>
											<p class="text-xs text-gray-600 mt-1">{trait.evidence}</p>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>

					<!-- Workflow Patterns Section -->
					{#if memory.patterns.length > 0}
						<div>
							<h3 class="text-lg font-semibold text-gray-900 mb-3">Discovered Workflow Patterns</h3>
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
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>