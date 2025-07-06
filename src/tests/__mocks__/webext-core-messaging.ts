// Mock for @webext-core/messaging
import { vi } from "vitest";

export function defineExtensionMessaging() {
	return {
		sendMessage: vi.fn(),
		onMessage: vi.fn(),
	};
}
