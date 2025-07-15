import { crx } from "@crxjs/vite-plugin";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import manifest from "./manifest.json";

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		svelte({
			preprocess: vitePreprocess(),
		}),
		crx({ manifest }),
	],
	build: {
		outDir: "dist",
		emptyOutDir: true,
		sourcemap: true, // Only for development, set to false for production
		rollupOptions: {
			input: {
				sidepanel: "sidepanel.html",
				offscreen: "offscreen.html",
			},
		},
	},
});
