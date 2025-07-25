// Vitest setup file
import "@testing-library/jest-dom/vitest";
import { afterAll, beforeAll, vi } from "vitest";

// Store original console methods
const originalConsole = {
	log: console.log,
	warn: console.warn,
	error: console.error,
	debug: console.debug,
};

// Mock console methods before all tests
beforeAll(() => {
	console.log = vi.fn();
	console.warn = vi.fn();
	console.error = vi.fn();
	console.debug = vi.fn();
});

// Restore console methods after all tests
afterAll(() => {
	console.log = originalConsole.log;
	console.warn = originalConsole.warn;
	console.error = originalConsole.error;
	console.debug = originalConsole.debug;
});

// Mock chrome storage API
// biome-ignore lint/suspicious/noExplicitAny: Required for test mocking
(global as any).chrome = {
	storage: {
		local: {
			get: vi.fn().mockResolvedValue({}),
			set: vi.fn().mockResolvedValue(undefined),
			remove: vi.fn().mockResolvedValue(undefined),
			clear: vi.fn().mockResolvedValue(undefined),
		},
	},
};
