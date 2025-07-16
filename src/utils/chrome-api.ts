/**
 * Chrome API wrappers and utilities
 * Centralized location for all Chrome API interactions
 */

import { ok, ResultAsync } from "neverthrow";

// Offscreen document management
let creatingOffscreenDocument: Promise<void> | null = null;
let offscreenDocumentReady = false;

export function ensureOffscreenDocument(): ResultAsync<void, Error> {
	// Fast path: already confirmed to exist
	if (offscreenDocumentReady) {
		return ResultAsync.fromSafePromise(Promise.resolve());
	}

	// Check if document exists
	const checkExisting = ResultAsync.fromPromise(
		chrome.runtime.getContexts({
			contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
			documentUrls: [chrome.runtime.getURL("offscreen.html")],
		}),
		(error) =>
			new Error(`Error checking for offscreen document`, { cause: error }),
	);

	return checkExisting.andThen((existingContexts) => {
		if (existingContexts.length > 0) {
			offscreenDocumentReady = true;
			return ok(undefined);
		}

		// If already creating, wait for it
		if (creatingOffscreenDocument) {
			console.debug(
				"[Chrome API] Offscreen document creation in progress, waiting...",
			);
			return ResultAsync.fromPromise(
				creatingOffscreenDocument,
				(error) =>
					new Error(`Failed to create offscreen document`, { cause: error }),
			);
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
			.finally(() => {
				creatingOffscreenDocument = null;
			});

		return ResultAsync.fromPromise(
			creatingOffscreenDocument,
			(error) =>
				new Error(`Failed to create offscreen document`, { cause: error }),
		);
	});
}

// Alarm management
export function setAlarm(
	name: string,
	delayInMinutes: number,
): ResultAsync<void, Error> {
	return ResultAsync.fromPromise(
		chrome.alarms.clear(name),
		(error) => new Error(`Failed to clear alarm`, { cause: error }),
	).andThen(() =>
		ResultAsync.fromPromise(
			chrome.alarms.create(name, { delayInMinutes }),
			(error) => new Error(`Failed to create alarm`, { cause: error }),
		),
	);
}

export function getAlarm(
	name: string,
): ResultAsync<chrome.alarms.Alarm | undefined, Error> {
	return ResultAsync.fromPromise(
		chrome.alarms.get(name),
		(error) => new Error(`Failed to get alarm`, { cause: error }),
	);
}

export function clearAlarm(name: string): ResultAsync<boolean, Error> {
	return ResultAsync.fromPromise(
		chrome.alarms.clear(name),
		(error) => new Error(`Failed to clear alarm`, { cause: error }),
	);
}

// History API
export function searchHistory(
	query: chrome.history.HistoryQuery,
): ResultAsync<chrome.history.HistoryItem[], Error> {
	return ResultAsync.fromPromise(
		new Promise<chrome.history.HistoryItem[]>((resolve) => {
			chrome.history.search(query, (items) => {
				resolve(items);
			});
		}),
		(error) => new Error(`Failed to search history`, { cause: error }),
	);
}

// Notification API
export function createNotification(
	notificationId: string,
	options: chrome.notifications.NotificationCreateOptions,
): ResultAsync<string, Error> {
	return ResultAsync.fromPromise(
		new Promise<string>((resolve) => {
			chrome.notifications.create(notificationId, options, (id) => {
				resolve(id);
			});
		}),
		(error) => new Error(`Failed to create notification`, { cause: error }),
	);
}
