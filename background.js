// Background service worker for the History Workflow Analyzer extension

// Handle extension icon click to open side panel
chrome.action.onClicked.addListener((tab) => {
	// Open the side panel when the extension icon is clicked
	chrome.sidePanel.open({ windowId: tab.windowId });
});

// Set up side panel behavior
chrome.sidePanel
	.setPanelBehavior({ openPanelOnActionClick: true })
	.catch((error) => console.error("Failed to set panel behavior:", error));

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
	console.log("History Workflow Analyzer extension installed");
});

// Handle any errors
self.addEventListener("error", (event) => {
	console.error("Background script error:", event.error);
});
