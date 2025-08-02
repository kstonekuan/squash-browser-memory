// Get URL parameters
const params = new URLSearchParams(window.location.search);
const appName = params.get("appName") || "Unknown Application";
const domain = params.get("domain") || "unknown";
const requestId = params.get("requestId");

// Update UI with app info
const appNameElement = document.getElementById("appName");
const domainElement = document.getElementById("domain");

if (appNameElement) {
	appNameElement.textContent = appName;
}
if (domainElement) {
	domainElement.textContent = domain;
}

// Handle allow button
const allowBtn = document.getElementById("allowBtn");
if (allowBtn) {
	allowBtn.addEventListener("click", async () => {
		await chrome.runtime.sendMessage({
			type: "PERMISSION_RESPONSE",
			granted: true,
			requestId: requestId,
		});
		window.close();
	});
}

// Handle deny button
const denyBtn = document.getElementById("denyBtn");
if (denyBtn) {
	denyBtn.addEventListener("click", async () => {
		await chrome.runtime.sendMessage({
			type: "PERMISSION_RESPONSE",
			granted: false,
			requestId: requestId,
		});
		window.close();
	});
}

// Handle escape key
document.addEventListener("keydown", (e) => {
	if (e.key === "Escape" && denyBtn) {
		denyBtn.click();
	}
});
