// Example: Using Squash SDK in a React app after npm install
// npm install squash-sdk

import { useEffect, useState } from "react";
import squash from "squash-sdk";

function MyApp() {
	const [isInitialized, setIsInitialized] = useState(false);
	const [context, setContext] = useState(null);

	useEffect(() => {
		// Initialize the SDK when your app loads
		async function initializeSquash() {
			try {
				const result = await squash.init({
					appName: "My Awesome App",
					appId: "my-app-unique-id",
					installPrompt: true,
					theme: "auto",
				});

				if (result.permissionGranted) {
					setIsInitialized(true);
					console.log("Squash SDK initialized successfully");
				}
			} catch (error) {
				console.error("Failed to initialize Squash SDK:", error);
			}
		}

		initializeSquash();
	}, []);

	const handleGetContext = async () => {
		if (!isInitialized) {
			console.warn("SDK not initialized yet");
			return;
		}

		try {
			const result = await squash.getContext({
				relevanceQuery: "javascript, react, frontend",
				timeRange: "7d",
				maxTokens: 1000,
				format: "structured",
			});

			if (result.status === "success") {
				setContext(result.context);
				// Use the context to personalize your app
				personalizeUserExperience(result.context);
			}
		} catch (error) {
			console.error("Failed to get context:", error);
		}
	};

	const personalizeUserExperience = (userContext) => {
		// Example: Adjust recommendations based on user interests
		if (userContext.topics?.some((topic) => topic.topic.includes("react"))) {
			// Show React-specific content
		}

		// Example: Adapt UI based on user patterns
		if (userContext.patterns?.some((p) => p.name.includes("dark mode"))) {
			// Apply dark theme
		}
	};

	return (
		<div>
			<button
				type="button"
				onClick={handleGetContext}
				disabled={!isInitialized}
			>
				Personalize My Experience
			</button>

			{context && (
				<div>
					<h3>Personalized for you:</h3>
					<p>{context.summary}</p>
				</div>
			)}
		</div>
	);
}

export default MyApp;
