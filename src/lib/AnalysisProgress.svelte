<script lang="ts">
export type AnalysisPhase =
	| "idle"
	| "calculating"
	| "chunking"
	| "analyzing"
	| "retrying"
	| "complete"
	| "error";

export type SubPhase = "sending-analysis" | "sending-merge" | "processing";

let {
	phase = "idle",
	chunkProgress = null,
	retryMessage = "",
	onCancel,
	subPhase = undefined,
	isAmbientAnalysis = false,
} = $props<{
	phase: AnalysisPhase;
	chunkProgress?: {
		current: number;
		total: number;
		description: string;
	} | null;
	retryMessage?: string;
	onCancel?: () => void;
	subPhase?: SubPhase;
	isAmbientAnalysis?: boolean;
}>();

const phases = [
	{
		id: "calculating",
		label: "Processing Data",
		description: "Calculating statistics",
	},
	{
		id: "chunking",
		label: "Organizing Sessions",
		description: "Identifying browsing sessions",
	},
	{
		id: "analyzing",
		label: "AI Analysis",
		description: "Analyzing patterns & profile",
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

function getSubPhaseIcon(subPhase: SubPhase | undefined): string {
	switch (subPhase) {
		case "sending-analysis":
			return "📤";
		case "sending-merge":
			return "🔄";
		case "processing":
			return "⚙️";
		default:
			return "";
	}
}
</script>

{#if phase !== 'idle' || isAmbientAnalysis}
	<div class="bg-white rounded-lg shadow-md p-6 mb-8">
		<h3 class="text-lg font-semibold text-gray-900 mb-4">
			{isAmbientAnalysis ? 'Ambient Analysis in Progress' : 'Analysis Progress'}
		</h3>
		
		{#if isAmbientAnalysis && phase === 'idle'}
			<!-- Show pulsing animation for ambient analysis -->
			<div class="flex flex-col items-center py-8">
				<div class="mb-4">
					<div class="animate-pulse rounded-full h-16 w-16 bg-blue-100 flex items-center justify-center">
						<svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
				</div>
				<p class="text-sm text-gray-600 text-center">
					Analyzing your browsing history in the background...<br/>
					<span class="text-xs text-gray-500 mt-1">This happens automatically every hour</span>
				</p>
			</div>
		{:else}
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
								{#if chunkProgress && phase === 'analyzing'}
									<div class="text-xs text-blue-600 font-medium mt-1">
										Chunk {chunkProgress.current} of {chunkProgress.total}
									</div>
								{/if}
								{#if chunkProgress?.description}
									<div class="text-xs text-gray-600 mt-1 max-w-[200px] mx-auto">
										{#if subPhase}
											<span class="text-lg mr-1">{getSubPhaseIcon(subPhase)}</span>
										{/if}
										{chunkProgress.description}
									</div>
								{/if}
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
		{/if}
		
		{#if phase === 'retrying' && retryMessage}
			<div class="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
				<p class="text-sm text-yellow-800">{retryMessage}</p>
			</div>
		{/if}
		
		{#if phase === 'error'}
			<div class="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
				<p class="text-sm text-red-800">An error occurred during analysis. Please try again.</p>
			</div>
		{/if}
		
		{#if phase !== 'complete' && phase !== 'error'}
			<div class="mt-6 flex flex-col items-center gap-3">
				<div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
				
				{#if chunkProgress?.description && phase !== 'analyzing'}
					<div class="text-sm text-gray-600 text-center px-4">
						{chunkProgress.description}
					</div>
				{/if}
				
				{#if onCancel}
					<button
						onclick={onCancel}
						type="button"
						class="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
					>
						Cancel Analysis
					</button>
				{/if}
			</div>
		{/if}
	</div>
{/if}