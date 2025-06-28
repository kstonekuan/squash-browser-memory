import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [svelte({ hot: !process.env.VITEST })],
	test: {
		globals: true,
		environment: "jsdom",
		setupFiles: ["./src/tests/setup.ts"],
		include: ["src/**/*.{test,spec}.{js,ts}"],
	},
	resolve: {
		conditions: ["browser"],
	},
});
