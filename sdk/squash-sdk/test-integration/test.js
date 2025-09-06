const { squash } = require("squash-sdk");

console.log("Testing Squash SDK...\n");

// Check available methods
console.log("Available methods:");
console.log("- squash.init:", typeof squash.init);
console.log("- squash.getContext:", typeof squash.getContext);
console.log(
	"- squash.isExtensionInstalled:",
	typeof squash.isExtensionInstalled,
);
console.log("- squash.showInstallPrompt:", typeof squash.showInstallPrompt);
console.log("- squash.enableMockMode:", typeof squash.enableMockMode);
console.log("- squash.disableMockMode:", typeof squash.disableMockMode);
console.log("- squash.trackEvent:", typeof squash.trackEvent);

// Test mock mode
console.log("\nTesting mock mode...");
squash.enableMockMode();

// Initialize SDK
squash
	.init({
		appName: "Test App",
		appId: "test-app",
		mockMode: true,
	})
	.then((result) => {
		console.log("\nInit result:", JSON.stringify(result, null, 2));

		// Get context
		return squash.getContext({
			relevanceQuery: "testing",
			timeRange: "7d",
			maxTokens: 500,
		});
	})
	.then((result) => {
		console.log("\nContext result:");
		console.log("- Status:", result.status);
		console.log("- Has context:", !!result.context);
		console.log("- Is mock data:", result.metadata.isMockData);

		if (result.context) {
			console.log("- Summary length:", result.context.summary.length);
			console.log("- Patterns count:", result.context.patterns.length);
			console.log("- Topics count:", result.context.topics.length);
			console.log(
				"- Recent activities:",
				result.context.recentActivities.length,
			);
		}

		console.log("\n✅ SDK is working correctly!");
	})
	.catch((err) => {
		console.error("Error:", err);
	});
