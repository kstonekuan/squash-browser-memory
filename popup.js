// Check if we have a pending permission request
chrome.storage.local.get(["pendingPermissionRequest"], (result) => {
	if (result.pendingPermissionRequest) {
		showPermissionRequest(result.pendingPermissionRequest);
	} else {
		showDefaultView();
	}
});

function showPermissionRequest(request) {
	document.getElementById("defaultView").style.display = "none";
	document.getElementById("permissionRequest").classList.add("active");

	document.getElementById("appName").textContent = request.appName;
	document.getElementById("domain").textContent = request.domain;

	// Handle allow button
	document.getElementById("allowBtn").addEventListener("click", async () => {
		await handlePermissionResponse(request.requestId, true);
	});

	// Handle deny button
	document.getElementById("denyBtn").addEventListener("click", async () => {
		await handlePermissionResponse(request.requestId, false);
	});
}

function showDefaultView() {
	document.getElementById("defaultView").style.display = "block";
	document.getElementById("permissionRequest").classList.remove("active");

	// Handle open sidepanel button
	document.getElementById("openSidepanelBtn").addEventListener("click", (e) => {
		e.preventDefault();
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (tabs[0]) {
				chrome.sidePanel.open({ windowId: tabs[0].windowId });
				window.close();
			}
		});
	});
}

async function handlePermissionResponse(requestId, granted) {
	// Send response to background script
	await chrome.runtime.sendMessage({
		type: "PERMISSION_RESPONSE",
		requestId: requestId,
		granted: granted,
	});

	// Clear the pending request
	await chrome.storage.local.remove(["pendingPermissionRequest"]);

	// Close the popup
	window.close();
}
