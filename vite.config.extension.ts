import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { copyFileSync, mkdirSync } from "fs";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		svelte({
			preprocess: vitePreprocess(),
		}),
		{
			name: "copy-extension-files",
			writeBundle() {
				// Copy manifest.json
				copyFileSync(
					resolve(__dirname, "extension/manifest.json"),
					resolve(__dirname, "dist-extension/manifest.json"),
				);
				
				// Copy background.js
				copyFileSync(
					resolve(__dirname, "extension/background.js"),
					resolve(__dirname, "dist-extension/background.js"),
				);
				
				// Copy icons directory
				const iconsDir = resolve(__dirname, "dist-extension/icons");
				mkdirSync(iconsDir, { recursive: true });
				
				["16", "48", "128"].forEach(size => {
					copyFileSync(
						resolve(__dirname, `extension/icons/icon-${size}.svg`),
						resolve(iconsDir, `icon-${size}.svg`),
					);
				});
				
				console.log("Extension files copied successfully");
			},
		},
	],
	build: {
		outDir: "dist-extension",
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