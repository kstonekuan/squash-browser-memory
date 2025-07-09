/**
 * Chrome API wrappers and utilities
 * Centralized location for all Chrome API interactions
 */

// Offscreen document management
let creatingOffscreenDocument: Promise<void> | null = null;

export async function ensureOffscreenDocument(): Promise<void> {
	const existingContexts = await chrome.runtime.getContexts({
		contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
		documentUrls: [chrome.runtime.getURL("offscreen.html")],
	});

	if (existingContexts.length > 0) {
		return;
	}

	// If already creating, wait for it
	if (creatingOffscreenDocument) {
		await creatingOffscreenDocument;
		return;
	}

	// Create new document
	creatingOffscreenDocument = chrome.offscreen
		.createDocument({
			url: "offscreen.html",
			reasons: ["DOM_PARSER" as chrome.offscreen.Reason],
			justification:
				"AI analysis of browsing history requires DOM parsing capabilities",
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
