<script lang="ts">
import { onMount } from "svelte";
import { createChromeStorage } from "../utils/storage";

interface SitePermission {
	domain: string;
	granted: boolean;
	grantedAt?: number;
}

let permissions: SitePermission[] = [];
let loading = true;
let isOpen = false;

onMount(() => {
	loadPermissions();

	// Listen for storage changes
	chrome.storage.onChanged.addListener((changes, areaName) => {
		if (areaName === "local") {
			// Check if any permission keys changed
			const hasPermissionChange = Object.keys(changes).some((key) =>
				key.startsWith("permission_"),
			);
			if (hasPermissionChange) {
				loadPermissions();
			}
		}
	});
});

async function loadPermissions() {
	try {
		const storage = createChromeStorage();
		if (!storage) {
			console.error("Chrome storage not available");
			return;
		}

		// Get all storage items
		const items = await new Promise<{ [key: string]: unknown }>((resolve) => {
			storage.get(null, (result) => resolve(result));
		});

		// Filter for permission keys
		const permissionList: SitePermission[] = [];
		for (const [key, value] of Object.entries(items)) {
			if (key.startsWith("permission_") && typeof value === "boolean") {
				const domain = key.replace("permission_", "");
				permissionList.push({
					domain,
					granted: value,
					grantedAt: items[`permission_time_${domain}`] as number | undefined,
				});
			}
		}

		// Sort by domain name
		permissions = permissionList.sort((a, b) =>
			a.domain.localeCompare(b.domain),
		);

		loading = false;
	} catch (error) {
		console.error("Error loading permissions:", error);
		loading = false;
	}
}

async function revokePermission(domain: string) {
	try {
		const storage = createChromeStorage();
		if (!storage) {
			console.error("Chrome storage not available");
			return;
		}

		// Remove the permission
		await new Promise<void>((resolve) => {
			storage.remove(
				[`permission_${domain}`, `permission_time_${domain}`],
				() => {
					resolve();
				},
			);
		});

		// Reload permissions
		await loadPermissions();
	} catch (error) {
		console.error("Error revoking permission:", error);
	}
}

function formatDate(timestamp: number | undefined): string {
	if (!timestamp) return "Unknown";
	return new Date(timestamp).toLocaleDateString();
}
</script>

<div class="site-permissions">
	<button
		class="collapsible-header"
		on:click={() => isOpen = !isOpen}
		aria-expanded={isOpen}
	>
		<svg
			class="chevron"
			class:rotated={isOpen}
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				d="M6 4L10 8L6 12"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
		<span>Site Permissions</span>
		{#if !loading && permissions.length > 0}
			<span class="count">({permissions.length})</span>
		{/if}
	</button>
	
	{#if isOpen}
		<div class="collapsible-content">
			{#if loading}
				<div class="loading">Loading permissions...</div>
			{:else if permissions.length === 0}
				<div class="empty-state">
					<p>No sites have been granted permission yet.</p>
					<p class="hint">Sites will appear here after you grant them access to your browsing context.</p>
				</div>
			{:else}
				<div class="permissions-list">
					{#each permissions as permission}
						<div class="permission-item">
							<div class="permission-info">
								<div class="domain">{permission.domain}</div>
								{#if permission.grantedAt}
									<div class="granted-date">
										Granted: {formatDate(permission.grantedAt)}
									</div>
								{/if}
							</div>
							<button
								class="revoke-btn"
								on:click={() => revokePermission(permission.domain)}
								title="Revoke permission for {permission.domain}"
							>
								Revoke
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.site-permissions {
		margin-bottom: 1rem;
	}
	
	.collapsible-header {
		width: 100%;
		padding: 0.75rem 1rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);
		transition: all 0.2s ease;
	}
	
	.collapsible-header:hover {
		background: var(--color-surface-hover);
		border-color: var(--color-border-hover);
	}
	
	.chevron {
		transition: transform 0.2s ease;
		flex-shrink: 0;
	}
	
	.chevron.rotated {
		transform: rotate(90deg);
	}
	
	.count {
		margin-left: auto;
		color: var(--color-text-secondary);
		font-weight: 400;
	}
	
	.collapsible-content {
		margin-top: 0.5rem;
		padding: 1rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 8px;
	}
	
	.loading,
	.empty-state {
		text-align: center;
		color: var(--color-text-secondary);
		padding: 1rem;
	}
	
	.empty-state p {
		margin: 0 0 0.5rem 0;
	}
	
	.empty-state .hint {
		font-size: 0.813rem;
		margin: 0;
	}
	
	.permissions-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	
	.permission-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem;
		background: var(--color-background);
		border-radius: 6px;
		border: 1px solid var(--color-border);
	}
	
	.permission-info {
		flex: 1;
	}
	
	.domain {
		font-weight: 500;
		color: var(--color-text);
		margin-bottom: 0.25rem;
	}
	
	.granted-date {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}
	
	.revoke-btn {
		padding: 0.375rem 0.75rem;
		background: transparent;
		border: 1px solid var(--color-danger);
		color: var(--color-danger);
		border-radius: 4px;
		font-size: 0.813rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}
	
	.revoke-btn:hover {
		background: var(--color-danger);
		color: white;
	}
	
	/* Dark mode support */
	:global(.dark) .collapsible-header {
		background: #2d2d2d;
		border-color: #3d3d3d;
	}
	
	:global(.dark) .collapsible-header:hover {
		background: #333333;
		border-color: #4d4d4d;
	}
	
	:global(.dark) .collapsible-content {
		background: #2d2d2d;
		border-color: #3d3d3d;
	}
	
	:global(.dark) .permission-item {
		background: #1a1a1a;
		border-color: #3d3d3d;
	}
	
	/* CSS Variables */
	:root {
		--color-danger: #dc3545;
	}
</style>