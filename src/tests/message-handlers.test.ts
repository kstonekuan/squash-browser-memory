/**
 * Unit tests for pure message handler business logic
 */

import { describe, expect, it, vi } from "vitest";
import {
	cancelAnalysisLogic,
	checkAnalysisRunningLogic,
	cleanupAnalysis,
	getAnalysisStateLogic,
	handleAutoAnalysisToggleLogic,
	handleCancelLogic,
	prepareForNewAnalysis,
	queryNextAlarmLogic,
	registerAnalysis,
	shouldCreateOffscreenDocument,
	shouldStopKeepalive,
	updateProgressMap,
} from "../utils/message-handlers";
import type { AnalysisProgress } from "../utils/messaging";

describe("Message Handler Business Logic", () => {
	describe("handleAutoAnalysisToggleLogic", () => {
		it("should enable auto-analysis and create alarm", async () => {
			const mockAlarms = {
				clear: vi.fn().mockResolvedValue(true),
				create: vi.fn().mockResolvedValue(undefined),
				get: vi.fn().mockResolvedValue({
					name: "test-alarm",
					scheduledTime: Date.now() + 60000,
				} as chrome.alarms.Alarm),
				onAlarm: {
					addListener: vi.fn(),
					removeListener: vi.fn(),
					hasListener: vi.fn(),
					hasListeners: vi.fn(),
					addRules: vi.fn(),
					getRules: vi.fn(),
					removeRules: vi.fn(),
				},
				clearAll: vi.fn(),
				getAll: vi.fn(),
			} as typeof chrome.alarms;

			const result = await handleAutoAnalysisToggleLogic(
				true,
				"test-alarm",
				mockAlarms,
			);

			expect(mockAlarms.clear).toHaveBeenCalledWith("test-alarm");
			expect(mockAlarms.create).toHaveBeenCalledWith("test-alarm", {
				delayInMinutes: 1,
			});
			expect(mockAlarms.get).toHaveBeenCalledWith("test-alarm");
			expect(result).toEqual({
				success: true,
				nextRunTime: expect.any(Number),
			});
		});

		it("should disable auto-analysis and clear alarm", async () => {
			const mockAlarms = {
				clear: vi.fn().mockResolvedValue(true),
				create: vi.fn(),
				get: vi.fn(),
				onAlarm: {
					addListener: vi.fn(),
					removeListener: vi.fn(),
					hasListener: vi.fn(),
					hasListeners: vi.fn(),
					addRules: vi.fn(),
					getRules: vi.fn(),
					removeRules: vi.fn(),
				},
				clearAll: vi.fn(),
				getAll: vi.fn(),
			} as typeof chrome.alarms;

			const result = await handleAutoAnalysisToggleLogic(
				false,
				"test-alarm",
				mockAlarms,
			);

			expect(mockAlarms.clear).toHaveBeenCalledWith("test-alarm");
			expect(mockAlarms.create).not.toHaveBeenCalled();
			expect(result).toEqual({ success: true });
		});

		it("should handle alarm creation failure", async () => {
			const mockAlarms = {
				clear: vi.fn().mockResolvedValue(true),
				create: vi.fn().mockResolvedValue(undefined),
				get: vi.fn().mockResolvedValue(null), // No alarm created
				onAlarm: {
					addListener: vi.fn(),
					removeListener: vi.fn(),
					hasListener: vi.fn(),
					hasListeners: vi.fn(),
					addRules: vi.fn(),
					getRules: vi.fn(),
					removeRules: vi.fn(),
				},
				clearAll: vi.fn(),
				getAll: vi.fn(),
			} as typeof chrome.alarms;

			const result = await handleAutoAnalysisToggleLogic(
				true,
				"test-alarm",
				mockAlarms,
			);

			expect(result).toEqual({
				success: false,
				error: "Failed to create alarm",
			});
		});
	});

	describe("queryNextAlarmLogic", () => {
		it("should return alarm info when alarm exists", async () => {
			const mockAlarms = {
				clear: vi.fn(),
				create: vi.fn(),
				get: vi.fn().mockResolvedValue({
					name: "test-alarm",
					scheduledTime: Date.now() + 60000,
				} as chrome.alarms.Alarm),
				onAlarm: {
					addListener: vi.fn(),
					removeListener: vi.fn(),
					hasListener: vi.fn(),
					hasListeners: vi.fn(),
					addRules: vi.fn(),
					getRules: vi.fn(),
					removeRules: vi.fn(),
				},
				clearAll: vi.fn(),
				getAll: vi.fn(),
			} as typeof chrome.alarms;

			const result = await queryNextAlarmLogic("test-alarm", mockAlarms);

			expect(result).toEqual({
				nextRunTime: expect.any(Number),
				alarmExists: true,
			});
		});

		it("should return alarmExists false when no alarm", async () => {
			const mockAlarms = {
				clear: vi.fn(),
				create: vi.fn(),
				get: vi.fn().mockResolvedValue(null),
				onAlarm: {
					addListener: vi.fn(),
					removeListener: vi.fn(),
					hasListener: vi.fn(),
					hasListeners: vi.fn(),
					addRules: vi.fn(),
					getRules: vi.fn(),
					removeRules: vi.fn(),
				},
				clearAll: vi.fn(),
				getAll: vi.fn(),
			} as typeof chrome.alarms;

			const result = await queryNextAlarmLogic("test-alarm", mockAlarms);

			expect(result).toEqual({
				nextRunTime: undefined,
				alarmExists: false,
			});
		});
	});

	describe("getAnalysisStateLogic", () => {
		it("should return current analysis state", () => {
			const progressMap = new Map<string, AnalysisProgress>();
			progressMap.set("analysis-123", {
				analysisId: "analysis-123",
				phase: "analyzing",
				chunkProgress: {
					current: 2,
					total: 5,
					description: "Processing chunk 2 of 5",
				},
			});

			const result = getAnalysisStateLogic(true, "analysis-123", progressMap);

			expect(result).toEqual({
				isRunning: true,
				isManualAnalysisRunning: true,
				isAmbientAnalysisRunning: true,
				analysisId: "analysis-123",
				phase: "analyzing",
				chunkProgress: {
					current: 2,
					total: 5,
					description: "Processing chunk 2 of 5",
				},
			});
		});

		it("should handle no current analysis", () => {
			const progressMap = new Map<string, AnalysisProgress>();

			const result = getAnalysisStateLogic(false, null, progressMap);

			expect(result).toEqual({
				isRunning: false,
				isManualAnalysisRunning: false,
				isAmbientAnalysisRunning: false,
				analysisId: undefined,
				phase: undefined,
				chunkProgress: undefined,
			});
		});
	});

	describe("checkAnalysisRunningLogic", () => {
		it("should allow start when no analysis running", () => {
			const result = checkAnalysisRunningLogic(false);

			expect(result).toEqual({
				canStart: true,
			});
		});

		it("should prevent start when analysis is running", () => {
			const result = checkAnalysisRunningLogic(true);

			expect(result).toEqual({
				canStart: false,
				error: "Analysis is already in progress",
			});
		});
	});

	describe("cancelAnalysisLogic", () => {
		it("should allow cancellation when analysis matches", () => {
			const activeAnalyses = new Map<string, boolean>();
			activeAnalyses.set("analysis-123", true);

			const result = cancelAnalysisLogic(
				"analysis-123",
				"analysis-123",
				activeAnalyses,
			);

			expect(result).toEqual({
				shouldCancel: true,
			});
		});

		it("should reject cancellation when analysis doesn't match", () => {
			const activeAnalyses = new Map<string, boolean>();

			const result = cancelAnalysisLogic(
				"analysis-123",
				"analysis-456",
				activeAnalyses,
			);

			expect(result).toEqual({
				shouldCancel: false,
				error: "No matching analysis in progress",
			});
		});

		it("should reject cancellation when analysis not found", () => {
			const activeAnalyses = new Map<string, boolean>();

			const result = cancelAnalysisLogic(
				"analysis-123",
				"analysis-123",
				activeAnalyses,
			);

			expect(result).toEqual({
				shouldCancel: false,
				error: "Analysis not found",
			});
		});
	});

	describe("shouldCreateOffscreenDocument", () => {
		it("should return true when no contexts exist", () => {
			const result = shouldCreateOffscreenDocument([]);
			expect(result).toBe(true);
		});

		it("should return false when contexts exist", () => {
			const mockContext = {} as chrome.runtime.ExtensionContext;
			const result = shouldCreateOffscreenDocument([mockContext]);
			expect(result).toBe(false);
		});
	});

	describe("updateProgressMap", () => {
		it("should update progress in the map", () => {
			const progressMap = new Map<string, AnalysisProgress>();
			const progress: AnalysisProgress = {
				analysisId: "analysis-123",
				phase: "analyzing",
			};

			updateProgressMap("analysis-123", progress, progressMap);

			expect(progressMap.get("analysis-123")).toEqual(progress);
		});
	});

	describe("offscreen analysis management", () => {
		it("should prepare for new analysis by canceling existing", () => {
			const activeAnalyses = new Map<string, AbortController>();
			const controller = new AbortController();
			const abortSpy = vi.spyOn(controller, "abort");
			activeAnalyses.set("old-analysis", controller);

			prepareForNewAnalysis("old-analysis", activeAnalyses);

			expect(abortSpy).toHaveBeenCalled();
			expect(activeAnalyses.has("old-analysis")).toBe(false);
		});

		it("should register new analysis", () => {
			const activeAnalyses = new Map<string, AbortController>();
			const controller = new AbortController();

			registerAnalysis("new-analysis", controller, activeAnalyses);

			expect(activeAnalyses.get("new-analysis")).toBe(controller);
		});

		it("should cleanup analysis and update current ID", () => {
			const activeAnalyses = new Map<string, AbortController>();
			const controller = new AbortController();
			activeAnalyses.set("analysis-123", controller);

			const newCurrentId = cleanupAnalysis(
				"analysis-123",
				"analysis-123",
				activeAnalyses,
			);

			expect(activeAnalyses.has("analysis-123")).toBe(false);
			expect(newCurrentId).toBe(null);
		});

		it("should determine when to stop keepalive", () => {
			const activeAnalyses = new Map<string, AbortController>();

			expect(shouldStopKeepalive(activeAnalyses)).toBe(true);

			activeAnalyses.set("analysis-123", new AbortController());
			expect(shouldStopKeepalive(activeAnalyses)).toBe(false);
		});
	});

	describe("handleCancelLogic", () => {
		it("should successfully cancel analysis", () => {
			const activeAnalyses = new Map<string, AbortController>();
			const controller = new AbortController();
			const abortSpy = vi.spyOn(controller, "abort");
			activeAnalyses.set("analysis-123", controller);

			const result = handleCancelLogic(
				"analysis-123",
				activeAnalyses,
				"analysis-123",
			);

			expect(abortSpy).toHaveBeenCalled();
			expect(activeAnalyses.has("analysis-123")).toBe(false);
			expect(result).toEqual({
				success: true,
				newCurrentAnalysisId: null,
			});
		});

		it("should handle analysis not found", () => {
			const activeAnalyses = new Map<string, AbortController>();

			const result = handleCancelLogic(
				"analysis-123",
				activeAnalyses,
				"current-analysis",
			);

			expect(result).toEqual({
				success: false,
				error: "Analysis not found",
				newCurrentAnalysisId: "current-analysis",
			});
		});
	});
});
