import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		svelte({
			preprocess: vitePreprocess(),
		}),
		webExtension({
			manifest: () => ({
				manifest_version: 3,
				name: "History Workflow Analyzer",
				version: "1.0.0",
				description:
					"Analyze your browsing history to find repetitive workflows that can be automated",
				minimum_chrome_version: "138",
				permissions: [
					"history",
					"storage",
					"sidePanel",
					"alarms",
					"notifications",
				],
				host_permissions: [],
				background: {
					service_worker: "src/background.ts",
				},
				side_panel: {
					default_path: "sidepanel.html",
				},
				action: {
					default_title: "Open History Analyzer in side panel",
				},
				icons: {
					16: "icons/icon-16.svg",
					48: "icons/icon-48.svg",
					128: "icons/icon-128.svg",
				},
			}),
			additionalInputs: ["sidepanel.html"],
			webExtConfig: {
				target: "chromium",
				chromiumProfile: "dev",
				startUrl: "chrome://extensions",
			},
		}),
	],
	build: {
		outDir: "dist",
		emptyOutDir: true,
	},
});
