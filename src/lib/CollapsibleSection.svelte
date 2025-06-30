<script lang="ts">
import type { Snippet } from "svelte";

interface Props {
	title: string;
	defaultOpen?: boolean;
	badge?: string;
	badgeColor?: "gray" | "blue" | "green" | "yellow" | "red";
	class?: string;
	"data-settings-section"?: string;
	onToggle?: (isOpen: boolean) => void;
	children: Snippet;
}

let {
	title,
	defaultOpen = false,
	badge = "",
	badgeColor = "gray",
	class: className = "",
	"data-settings-section": dataSettingsSection,
	onToggle,
	children,
}: Props = $props();

let isOpen = $state(defaultOpen);

function getBadgeClasses(color: string) {
	switch (color) {
		case "blue":
			return "bg-blue-100 text-blue-800";
		case "green":
			return "bg-green-100 text-green-800";
		case "yellow":
			return "bg-yellow-100 text-yellow-800";
		case "red":
			return "bg-red-100 text-red-800";
		default:
			return "bg-gray-100 text-gray-800";
	}
}
</script>

<div class={`border border-gray-200 rounded-lg ${className}`}>
	<button
		type="button"
		onclick={() => {
			isOpen = !isOpen;
			onToggle?.(isOpen);
		}}
		data-settings-section={dataSettingsSection}
		class="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors rounded-t-lg"
	>
		<div class="flex items-center gap-2">
			<span class="font-medium text-gray-700">{title}</span>
			{#if badge}
				<span class={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getBadgeClasses(badgeColor)}`}>
					{badge}
				</span>
			{/if}
		</div>
		<svg 
			class={`w-5 h-5 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
			fill="none" 
			stroke="currentColor" 
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>
	
	{#if isOpen}
		<div class="p-4 border-t border-gray-200">
			{@render children()}
		</div>
	{/if}
</div>