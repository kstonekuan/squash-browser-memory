import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
			},
			output: {
				entryFileNames: "[name].js",
				chunkFileNames: "[name].js",
				assetFileNames: "[name].[ext]",
			},
		},
	},
});
