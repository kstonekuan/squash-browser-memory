import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		svelte({
			preprocess: vitePreprocess(),
		}),
		{
			name: "copy-files",
			writeBundle() {
				// Copy manifest.json
				copyFileSync(
					resolve(__dirname, "manifest.json"),
					resolve(__dirname, "dist/manifest.json"),
				);

				// Copy background.js
				copyFileSync(
					resolve(__dirname, "background.js"),
					resolve(__dirname, "dist/background.js"),
				);

				// Copy icons directory
				const iconsDir = resolve(__dirname, "dist/icons");
				mkdirSync(iconsDir, { recursive: true });

				["16", "48", "128"].forEach((size) => {
					copyFileSync(
						resolve(__dirname, `icons/icon-${size}.svg`),
						resolve(iconsDir, `icon-${size}.svg`),
					);
				});

				// Create content-scripts directory
				const contentScriptsDir = resolve(__dirname, "dist/content-scripts");
				mkdirSync(contentScriptsDir, { recursive: true });

				console.log("Files copied successfully");
			},
		},
	],
	build: {
		outDir: "dist",
		emptyOutDir: true,
		rollupOptions: {
			input: {
				sidepanel: "sidepanel.html",
				"content-scripts/universal-context":
					"content-scripts/universal-context.ts",
			},
			output: {
				entryFileNames: "[name].js",
				chunkFileNames: "[name].js",
				assetFileNames: "[name].[ext]",
			},
			external: ["@xenova/transformers", "string-similarity"],
		},
	},
});
