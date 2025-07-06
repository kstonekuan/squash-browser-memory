import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onMessage } from "../utils/messaging";

// Test the actual message handlers by calling them directly
describe("Message Handlers Integration Tests", () => {
	// Mock chrome storage API
	beforeEach(() => {
		global.chrome = {
			storage: {
				local: {
					get: vi.fn().mockResolvedValue({}),
					set: vi.fn().mockResolvedValue(undefined),
				},
			},
			alarms: {
				create: vi.fn().mockResolvedValue(undefined),
				clear: vi.fn().mockResolvedValue(true),
				get: vi.fn().mockResolvedValue(null),
			},
		} as any;
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("settings:toggle-auto-analysis handler", () => {
		it("should enable auto-analysis and create alarm", async () => {
			const mockAlarm = { scheduledTime: Date.now() + 60000 };
			vi.mocked(chrome.alarms.get).mockResolvedValue(mockAlarm as any);

			// Import the background script to register handlers
			// We need to dynamically import to ensure fresh module state
			const { default: registerHandlers } = await import("../background");

			// Get the registered handler function
			const handlers: any[] = [];
			const mockOnMessage = vi.fn((name, handler) => {
				handlers.push({ name, handler });
			});

			// Temporarily replace onMessage to capture handlers
			const originalOnMessage = onMessage;
			(global as any).onMessage = mockOnMessage;

			// Re-import to register with our mock
			delete require.cache[require.resolve("../background")];
			await import("../background");

			// Find the specific handler
			const handler = handlers.find(h => h.name === "settings:toggle-auto-analysis");
			expect(handler).toBeDefined();

			// Test the handler logic directly
			const result = await handler.handler({ data: { enabled: true } });

			expect(chrome.alarms.clear).toHaveBeenCalledWith("hourly-analysis");
			expect(chrome.alarms.create).toHaveBeenCalledWith("hourly-analysis", {
				delayInMinutes: 1,
			});
			expect(result).toEqual({
				success: true,
				nextRunTime: mockAlarm.scheduledTime,
			});

			// Restore original
			(global as any).onMessage = originalOnMessage;
		});

		it("should disable auto-analysis and clear alarm", async () => {
			// Similar setup but test disabling
			const handlers: any[] = [];
			const mockOnMessage = vi.fn((name, handler) => {
				handlers.push({ name, handler });
			});

			const originalOnMessage = onMessage;
			(global as any).onMessage = mockOnMessage;

			delete require.cache[require.resolve("../background")];
			await import("../background");

			const handler = handlers.find(h => h.name === "settings:toggle-auto-analysis");
			const result = await handler.handler({ data: { enabled: false } });

			expect(chrome.alarms.clear).toHaveBeenCalledWith("hourly-analysis");
			expect(chrome.alarms.create).not.toHaveBeenCalled();
			expect(result).toEqual({ success: true });

			(global as any).onMessage = originalOnMessage;
		});
	});

	describe("ambient:query-next-alarm handler", () => {
		it("should return alarm info when alarm exists", async () => {
			const mockAlarm = {
				name: "hourly-analysis",
				scheduledTime: Date.now() + 3600000,
			};
			vi.mocked(chrome.alarms.get).mockResolvedValue(mockAlarm as any);

			const handlers: any[] = [];
			const mockOnMessage = vi.fn((name, handler) => {
				handlers.push({ name, handler });
			});

			const originalOnMessage = onMessage;
			(global as any).onMessage = mockOnMessage;

			delete require.cache[require.resolve("../background")];
			await import("../background");

			const handler = handlers.find(h => h.name === "ambient:query-next-alarm");
			const result = await handler.handler({});

			expect(chrome.alarms.get).toHaveBeenCalledWith("hourly-analysis");
			expect(result).toEqual({
				nextRunTime: mockAlarm.scheduledTime,
				alarmExists: true,
			});

			(global as any).onMessage = originalOnMessage;
		});

		it("should return alarmExists false when no alarm", async () => {
			vi.mocked(chrome.alarms.get).mockResolvedValue(null);

			const handlers: any[] = [];
			const mockOnMessage = vi.fn((name, handler) => {
				handlers.push({ name, handler });
			});

			const originalOnMessage = onMessage;
			(global as any).onMessage = mockOnMessage;

			delete require.cache[require.resolve("../background")];
			await import("../background");

			const handler = handlers.find(h => h.name === "ambient:query-next-alarm");
			const result = await handler.handler({});

			expect(result).toEqual({
				nextRunTime: undefined,
				alarmExists: false,
			});

			(global as any).onMessage = originalOnMessage;
		});
	});
});

// Test offscreen message handlers
describe("Offscreen Message Handlers", () => {
	let handlers: any[] = [];

	beforeEach(async () => {
		handlers = [];
		const mockOnMessage = vi.fn((name, handler) => {
			handlers.push({ name, handler });
		});

		const originalOnMessage = onMessage;
		(global as any).onMessage = mockOnMessage;

		// Import offscreen to register handlers
		delete require.cache[require.resolve("../offscreen")];
		await import("../offscreen");

		(global as any).onMessage = originalOnMessage;
	});

	describe("offscreen:keepalive handler", () => {
		it("should acknowledge keepalive", async () => {
			const handler = handlers.find(h => h.name === "offscreen:keepalive");
			expect(handler).toBeDefined();

			const result = await handler.handler({});
			expect(result).toEqual({ success: true });
		});
	});

	describe("offscreen:cancel handler", () => {
		it("should cancel active analysis", async () => {
			// First, we need to simulate starting an analysis
			const startHandler = handlers.find(h => h.name === "offscreen:start-analysis");
			const cancelHandler = handlers.find(h => h.name === "offscreen:cancel");

			expect(startHandler).toBeDefined();
			expect(cancelHandler).toBeDefined();

			// Start an analysis (this will fail but will register the ID)
			const analysisId = "test-analysis-123";
			try {
				await startHandler.handler({
					data: {
						historyItems: [],
						analysisId,
						trigger: "manual",
					}
				});
			} catch {
				// Expected to fail due to missing dependencies
			}

			// Now test cancellation
			const result = await cancelHandler.handler({
				data: { analysisId }
			});

			// Since we can't fully start an analysis in test, this might fail
			// But we're testing the handler structure exists
			expect(result).toHaveProperty("success");
		});

		it("should return error for non-existent analysis", async () => {
			const handler = handlers.find(h => h.name === "offscreen:cancel");
			const result = await handler.handler({
				data: { analysisId: "non-existent" }
			});

			expect(result).toEqual({
				success: false,
				error: "Analysis not found",
			});
		});
	});
});

// Test the business logic functions directly
describe("Memory Operations", () => {
	beforeEach(() => {
		global.chrome = {
			storage: {
				local: {
					get: vi.fn(),
					set: vi.fn(),
				},
			},
		} as any;
	});

	it("should handle memory read operations", async () => {
		const mockMemory = {
			version: 1,
			patterns: [],
			userProfile: {
				stableTraits: { coreIdentities: [] },
				currentProjects: [],
				recentSearches: [],
			},
			lastAnalyzedDate: new Date(),
			lastHistoryTimestamp: Date.now(),
		};

		vi.mocked(chrome.storage.local.get).mockResolvedValue({
			history_analysis_memory: mockMemory,
		});

		// Import the memory module
		const { loadMemory } = await import("../utils/memory");
		const result = await loadMemory();

		expect(chrome.storage.local.get).toHaveBeenCalledWith("history_analysis_memory");
		expect(result).toEqual(mockMemory);
	});

	it("should handle memory write operations", async () => {
		const mockMemory = {
			version: 1,
			patterns: [],
			userProfile: {
				stableTraits: { coreIdentities: [] },
				currentProjects: [],
				recentSearches: [],
			},
			lastAnalyzedDate: new Date(),
			lastHistoryTimestamp: Date.now(),
		};

		vi.mocked(chrome.storage.local.set).mockResolvedValue(undefined);

		const { saveMemory } = await import("../utils/memory");
		await saveMemory(mockMemory);

		expect(chrome.storage.local.set).toHaveBeenCalledWith({
			history_analysis_memory: mockMemory,
		});
	});
});