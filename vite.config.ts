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
			additionalInputs: ["sidepanel.html"],
		}),
	],
	build: {
		outDir: "dist",
		emptyOutDir: true,
	},
});
