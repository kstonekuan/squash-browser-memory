<script lang="ts">
export type AnalysisPhase =
	| "idle"
	| "parsing"
	| "calculating"
	| "analyzing"
	| "complete"
	| "error";

let { phase = "idle" } = $props<{
	phase: AnalysisPhase;
}>();

const phases = [
	{
		id: "parsing",
		label: "Parsing History",
		description: "Extracting history data",
	},
	{
		id: "calculating",
		label: "Calculating Stats",
		description: "Computing statistics",
	},
	{
		id: "analyzing",
		label: "Analyzing Patterns",
		description: "Finding workflows",
	},
	{ id: "complete", label: "Complete", description: "Analysis finished" },
];

function getPhaseIndex(phaseId: string): number {
	const index = phases.findIndex((p) => p.id === phaseId);
	return index === -1 ? -1 : index;
}

function isPhaseActive(phaseId: string): boolean {
	return phase === phaseId;
}

function isPhaseComplete(phaseId: string): boolean {
	const currentIndex = getPhaseIndex(phase);
	const phaseIndex = getPhaseIndex(phaseId);
	return currentIndex > phaseIndex;
}

function getPhaseStatus(phaseId: string): "pending" | "active" | "complete" {
	if (isPhaseComplete(phaseId)) return "complete";
	if (isPhaseActive(phaseId)) return "active";
	return "pending";
}
</script>

{#if phase !== 'idle'}
	<div class="bg-white rounded-lg shadow-md p-6 mb-8">
		<h3 class="text-lg font-semibold text-gray-900 mb-4">Analysis Progress</h3>
		
		<div class="relative">
			<!-- Progress line -->
			<div class="absolute top-5 left-0 right-0 h-0.5 bg-gray-200"></div>
			<div 
				class="absolute top-5 left-0 h-0.5 bg-blue-600 transition-all duration-500"
				style="width: {phase === 'error' ? '0%' : `${(getPhaseIndex(phase) + 1) / phases.length * 100}%`}"
			></div>
			
			<!-- Phase indicators -->
			<div class="relative flex justify-between">
				{#each phases as phaseItem, index}
					{@const status = getPhaseStatus(phaseItem.id)}
					<div class="flex flex-col items-center">
						<div class={`
							w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm
							transition-all duration-300
							${status === 'complete' ? 'bg-blue-600 text-white' : ''}
							${status === 'active' ? 'bg-blue-600 text-white ring-4 ring-blue-200 scale-110' : ''}
							${status === 'pending' ? 'bg-gray-200 text-gray-600' : ''}
						`}>
							{#if status === 'complete'}
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
								</svg>
							{:else}
								{index + 1}
							{/if}
						</div>
						<div class="mt-2 text-center">
							<div class={`text-sm font-medium ${status === 'active' ? 'text-blue-600' : 'text-gray-700'}`}>
								{phaseItem.label}
							</div>
							{#if status === 'active'}
								<div class="text-xs text-gray-500 mt-1">
									{phaseItem.description}
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
		
		{#if phase === 'error'}
			<div class="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
				<p class="text-sm text-red-800">An error occurred during analysis. Please try again.</p>
			</div>
		{/if}
		
		{#if phase !== 'complete' && phase !== 'error'}
			<div class="mt-6 flex justify-center">
				<div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
			</div>
		{/if}
	</div>
{/if}