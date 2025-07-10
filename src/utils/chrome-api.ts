/**
 * Chrome API wrappers and utilities
 * Centralized location for all Chrome API interactions
 */

// Offscreen document management
let creatingOffscreenDocument: Promise<void> | null = null;
let offscreenDocumentReady = false;

export async function ensureOffscreenDocument(): Promise<void> {
	// Fast path: already confirmed to exist
	if (offscreenDocumentReady) {
		return;
	}

	try {
		const existingContexts = await chrome.runtime.getContexts({
			contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
			documentUrls: [chrome.runtime.getURL("offscreen.html")],
		});

		if (existingContexts.length > 0) {
			offscreenDocumentReady = true;
			return;
		}
	} catch (error) {
		console.error("[Chrome API] Error checking for offscreen document:", error);
	}

	// If already creating, wait for it
	if (creatingOffscreenDocument) {
		console.debug(
			"[Chrome API] Offscreen document creation in progress, waiting...",
		);
		await creatingOffscreenDocument;
		return;
	}

	console.debug("[Chrome API] Creating offscreen document...");

	// Create new document
	creatingOffscreenDocument = chrome.offscreen
		.createDocument({
			url: "offscreen.html",
			reasons: ["DOM_PARSER" as chrome.offscreen.Reason],
			justification:
				"AI analysis of browsing history in the background requires long-living offscreen document",
		})
		.then(() => {
			offscreenDocumentReady = true;
			console.log("[Chrome API] Offscreen document created successfully");
		})
		.catch((error) => {
			console.error("[Chrome API] Failed to create offscreen document:", error);
			throw error;
		})
		.finally(() => {
			creatingOffscreenDocument = null;
		});

	await creatingOffscreenDocument;
}

// Alarm management
export async function setAlarm(
	name: string,
	delayInMinutes: number,
): Promise<void> {
	await chrome.alarms.clear(name);
	await chrome.alarms.create(name, { delayInMinutes });
}

export async function getAlarm(
	name: string,
): Promise<chrome.alarms.Alarm | null> {
	const alarm = await chrome.alarms.get(name);
	return alarm || null;
}

export async function clearAlarm(name: string): Promise<boolean> {
	return chrome.alarms.clear(name);
}

// History API
export async function searchHistory(
	query: chrome.history.HistoryQuery,
): Promise<chrome.history.HistoryItem[]> {
	return new Promise((resolve) => {
		chrome.history.search(query, (items) => {
			resolve(items);
		});
	});
}

// Notification API
export async function createNotification(
	notificationId: string,
	options: chrome.notifications.NotificationCreateOptions,
): Promise<string> {
	return new Promise((resolve) => {
		chrome.notifications.create(notificationId, options, (id) => {
			resolve(id);
		});
	});
}
