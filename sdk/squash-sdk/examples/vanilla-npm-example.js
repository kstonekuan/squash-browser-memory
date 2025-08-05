// Example: Using Squash SDK in vanilla JavaScript after npm install
// npm install squash-sdk

import squash from "squash-sdk";

// Initialize on page load
document.addEventListener("DOMContentLoaded", async () => {
	try {
		// Initialize the SDK
		const initResult = await squash.init({
			appName: "My Web App",
			appId: "my-web-app",
			installPrompt: true,
			theme: "auto",
			analytics: true,
		});

		if (initResult.permissionGranted) {
			console.log("Squash SDK ready to use");

			// Enable personalization button
			document.getElementById("personalizeBtn").disabled = false;
		} else {
			console.log("Permission not granted");
		}
	} catch (error) {
		console.error("SDK initialization failed:", error);
	}
});

// Get user context when requested
window.personalizeContent = async () => {
	try {
		const result = await squash.getContext({
			relevanceQuery: "shopping, e-commerce, products",
			timeRange: "30d",
			maxTokens: 2000,
			format: "structured",
		});

		if (result.status === "success" && result.context) {
			// Use the context data
			displayPersonalizedContent(result.context);
		}
	} catch (error) {
		console.error("Failed to get context:", error);
	}
};

function displayPersonalizedContent(context) {
	const container = document.getElementById("personalized-content");

	// Show user summary
	if (context.summary) {
		container.innerHTML = `
      <h2>Welcome back!</h2>
      <p>${context.summary}</p>
    `;
	}

	// Show relevant products based on interests
	if (context.topics && context.topics.length > 0) {
		const interests = context.topics.map((t) => t.topic).join(", ");
		container.innerHTML += `
      <h3>Based on your interests in: ${interests}</h3>
      <div id="recommended-products"></div>
    `;

		// Load products based on user interests
		loadRecommendedProducts(context.topics);
	}

	// Adapt UI based on patterns
	if (context.patterns) {
		context.patterns.forEach((pattern) => {
			if (pattern.name.includes("mobile")) {
				// Optimize for mobile usage
				document.body.classList.add("mobile-optimized");
			}
			if (pattern.name.includes("evening")) {
				// Apply dark theme for evening users
				document.body.classList.add("dark-theme");
			}
		});
	}
}

function loadRecommendedProducts(topics) {
	// Implementation would go here
	console.log("Loading products for topics:", topics);
}

// Example HTML:
/*
<!DOCTYPE html>
<html>
<head>
  <title>My E-commerce Site</title>
  <script type="module" src="./app.js"></script>
</head>
<body>
  <button id="personalizeBtn" onclick="personalizeContent()" disabled>
    Personalize My Shopping Experience
  </button>
  
  <div id="personalized-content"></div>
</body>
</html>
*/
