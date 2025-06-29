import { describe, expect, it } from "vitest";
import { createHalfDayChunks, createHistoryChunks } from "./chunking";
import type { ChunkTimeRange } from "./memory";

// Helper function to create test history items
function createTestHistoryItem(
	url: string,
	lastVisitTime: number,
): chrome.history.HistoryItem {
	return {
		id: Math.random().toString(),
		url,
		title: `Page ${url}`,
		lastVisitTime,
		visitCount: 1,
		typedCount: 0,
	};
}

// Helper to create date at specific time
function createDate(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number = 0,
): Date {
	return new Date(year, month - 1, day, hour, minute);
}

describe("createHistoryChunks", () => {
	describe("with no items", () => {
		it("should return empty array when given no items", () => {
			const result = createHistoryChunks([], []);
			expect(result).toEqual([]);
		});
	});

	describe("with time ranges", () => {
		it("should create chunks based on provided time ranges", () => {
			const items = [
				createTestHistoryItem(
					"https://example1.com",
					createDate(2024, 1, 15, 9, 0).getTime(),
				),
				createTestHistoryItem(
					"https://example2.com",
					createDate(2024, 1, 15, 10, 0).getTime(),
				),
				createTestHistoryItem(
					"https://example3.com",
					createDate(2024, 1, 15, 14, 0).getTime(),
				),
				createTestHistoryItem(
					"https://example4.com",
					createDate(2024, 1, 15, 15, 0).getTime(),
				),
			];

			const timeRanges: ChunkTimeRange[] = [
				{
					startTime: createDate(2024, 1, 15, 8, 0).getTime(),
					endTime: createDate(2024, 1, 15, 12, 0).getTime(),
					description: "Morning session",
				},
				{
					startTime: createDate(2024, 1, 15, 13, 0).getTime(),
					endTime: createDate(2024, 1, 15, 17, 0).getTime(),
					description: "Afternoon session",
				},
			];

			const result = createHistoryChunks(items, timeRanges);

			expect(result).toHaveLength(2);
			expect(result[0].items).toHaveLength(2); // morning items
			expect(result[0].isFallback).toBe(false);
			expect(result[1].items).toHaveLength(2); // afternoon items
			expect(result[1].isFallback).toBe(false);
		});

		it("should create fallback chunks for items outside time ranges", () => {
			const items = [
				createTestHistoryItem(
					"https://early.com",
					createDate(2024, 1, 15, 6, 0).getTime(),
				),
				createTestHistoryItem(
					"https://inrange.com",
					createDate(2024, 1, 15, 10, 0).getTime(),
				),
				createTestHistoryItem(
					"https://late.com",
					createDate(2024, 1, 15, 20, 0).getTime(),
				),
			];

			const timeRanges: ChunkTimeRange[] = [
				{
					startTime: createDate(2024, 1, 15, 9, 0).getTime(),
					endTime: createDate(2024, 1, 15, 11, 0).getTime(),
					description: "Work session",
				},
			];

			const result = createHistoryChunks(items, timeRanges);

			// Should have 3 chunks: 1 from AI + 2 fallback chunks for uncovered items
			expect(result).toHaveLength(3);

			// Find the chunk with the AI-identified time range
			const workChunk = result.find((chunk) => !chunk.isFallback);
			expect(workChunk).toBeDefined();
			expect(workChunk!.items).toHaveLength(1);
			expect(workChunk!.items[0].url).toBe("https://inrange.com");

			// Verify fallback chunks exist for uncovered items
			const fallbackChunks = result.filter((chunk) => chunk.isFallback);
			expect(fallbackChunks).toHaveLength(2);

			// All items should be covered
			const allItems = result.flatMap((chunk) => chunk.items);
			expect(allItems).toHaveLength(3);
		});

		it("should handle empty time ranges with fallback", () => {
			const items = [
				createTestHistoryItem(
					"https://example1.com",
					createDate(2024, 1, 15, 9, 0).getTime(),
				),
				createTestHistoryItem(
					"https://example2.com",
					createDate(2024, 1, 15, 14, 0).getTime(),
				),
			];

			const result = createHistoryChunks(items, []);

			// Should use fallback and create half-day chunks
			expect(result.length).toBeGreaterThan(0);
			expect(result[0].isFallback).toBe(true);
		});
	});

	describe("fallback half-day chunking", () => {
		it("should create morning and afternoon chunks for single day", () => {
			const items = [
				createTestHistoryItem(
					"https://morning1.com",
					createDate(2024, 1, 15, 9, 0).getTime(),
				),
				createTestHistoryItem(
					"https://morning2.com",
					createDate(2024, 1, 15, 11, 0).getTime(),
				),
				createTestHistoryItem(
					"https://afternoon1.com",
					createDate(2024, 1, 15, 14, 0).getTime(),
				),
				createTestHistoryItem(
					"https://evening1.com",
					createDate(2024, 1, 15, 20, 0).getTime(),
				),
			];

			// Trigger fallback by providing no time ranges
			const result = createHistoryChunks(items, []);

			expect(result).toHaveLength(2);

			// Morning chunk
			expect(result[0].items).toHaveLength(2);
			expect(result[0].startTime.getHours()).toBe(0);
			expect(result[0].endTime.getHours()).toBe(11);
			expect(result[0].isFallback).toBe(true);

			// Afternoon/Evening chunk
			expect(result[1].items).toHaveLength(2);
			expect(result[1].startTime.getHours()).toBe(12);
			expect(result[1].endTime.getHours()).toBe(23);
			expect(result[1].isFallback).toBe(true);
		});

		it("should handle multiple days with half-day chunks", () => {
			const items = [
				// Day 1
				createTestHistoryItem(
					"https://day1-morning.com",
					createDate(2024, 1, 15, 10, 0).getTime(),
				),
				createTestHistoryItem(
					"https://day1-evening.com",
					createDate(2024, 1, 15, 18, 0).getTime(),
				),
				// Day 2
				createTestHistoryItem(
					"https://day2-morning.com",
					createDate(2024, 1, 16, 8, 0).getTime(),
				),
				createTestHistoryItem(
					"https://day2-afternoon.com",
					createDate(2024, 1, 16, 15, 0).getTime(),
				),
			];

			const result = createHistoryChunks(items, []);

			expect(result).toHaveLength(4); // 2 chunks per day
			expect(result.every((chunk) => chunk.isFallback)).toBe(true);

			// Verify chronological order
			for (let i = 1; i < result.length; i++) {
				expect(result[i].startTime.getTime()).toBeGreaterThan(
					result[i - 1].startTime.getTime(),
				);
			}
		});

		it("should only create chunks for periods with activity", () => {
			const items = [
				// Only morning activity on day 1
				createTestHistoryItem(
					"https://day1-morning.com",
					createDate(2024, 1, 15, 10, 0).getTime(),
				),
				// Only evening activity on day 2
				createTestHistoryItem(
					"https://day2-evening.com",
					createDate(2024, 1, 16, 20, 0).getTime(),
				),
			];

			const result = createHistoryChunks(items, []);

			expect(result).toHaveLength(2); // Only chunks with activity
			expect(result[0].items).toHaveLength(1);
			expect(result[0].startTime.getDate()).toBe(15);
			expect(result[1].items).toHaveLength(1);
			expect(result[1].startTime.getDate()).toBe(16);
		});

		it("should handle late night activity spanning midnight", () => {
			const items = [
				createTestHistoryItem(
					"https://before-midnight.com",
					createDate(2024, 1, 15, 23, 30).getTime(),
				),
				createTestHistoryItem(
					"https://after-midnight.com",
					createDate(2024, 1, 16, 0, 30).getTime(),
				),
			];

			const result = createHistoryChunks(items, []);

			// Should create separate chunks for before and after midnight
			expect(result).toHaveLength(2);
			expect(result[0].items).toHaveLength(1);
			expect(result[0].startTime.getDate()).toBe(15);
			expect(result[1].items).toHaveLength(1);
			expect(result[1].startTime.getDate()).toBe(16);
		});
	});

	describe("edge cases", () => {
		it("should handle items with undefined lastVisitTime", () => {
			const items = [
				{
					id: "1",
					url: "https://example.com",
					title: "Example",
					visitCount: 1,
					typedCount: 0,
					// lastVisitTime is undefined
				} as chrome.history.HistoryItem,
				createTestHistoryItem(
					"https://valid.com",
					createDate(2024, 1, 15, 10, 0).getTime(),
				),
			];

			const timeRanges: ChunkTimeRange[] = [
				{
					startTime: createDate(2024, 1, 15, 0, 0).getTime(),
					endTime: createDate(2024, 1, 15, 23, 59).getTime(),
					description: "All day",
				},
			];

			const result = createHistoryChunks(items, timeRanges);

			expect(result).toHaveLength(1);
			expect(result[0].items).toHaveLength(1); // Only the valid item
			expect(result[0].items[0].url).toBe("https://valid.com");
		});

		it("should handle time ranges that produce no items", () => {
			const items = [
				createTestHistoryItem(
					"https://example.com",
					createDate(2024, 1, 15, 10, 0).getTime(),
				),
			];

			const timeRanges: ChunkTimeRange[] = [
				{
					startTime: createDate(2024, 1, 14, 0, 0).getTime(),
					endTime: createDate(2024, 1, 14, 23, 59).getTime(),
					description: "Previous day",
				},
				{
					startTime: createDate(2024, 1, 16, 0, 0).getTime(),
					endTime: createDate(2024, 1, 16, 23, 59).getTime(),
					description: "Next day",
				},
			];

			const result = createHistoryChunks(items, timeRanges);

			// Should fall back to half-day chunks
			expect(result.length).toBeGreaterThan(0);
			expect(result[0].isFallback).toBe(true);
			expect(result[0].items).toHaveLength(1);
		});

		it("should preserve chunk metadata", () => {
			const items = [
				createTestHistoryItem(
					"https://example.com",
					createDate(2024, 1, 15, 10, 0).getTime(),
				),
			];

			const timeRanges: ChunkTimeRange[] = [
				{
					startTime: createDate(2024, 1, 15, 0, 0).getTime(),
					endTime: createDate(2024, 1, 15, 23, 59).getTime(),
					description: "Test session",
				},
			];

			const result = createHistoryChunks(items, timeRanges, false);

			expect(result[0].chunkIndex).toBe(0);
			expect(result[0].totalChunks).toBe(1);
			expect(result[0].isFallback).toBe(false);
		});
	});
});

describe("createHalfDayChunks", () => {
	describe("with no timestamps", () => {
		it("should return empty array when given no timestamps", () => {
			const result = createHalfDayChunks([]);
			expect(result).toEqual([]);
		});
	});

	describe("with single timestamp", () => {
		it("should create appropriate half-day chunk for morning timestamp", () => {
			const timestamps = [createDate(2024, 1, 15, 9, 30).getTime()];
			const result = createHalfDayChunks(timestamps);

			expect(result).toHaveLength(1);
			expect(result[0].startTime).toBe(createDate(2024, 1, 15, 0, 0).getTime());
			expect(result[0].endTime).toBe(
				createDate(2024, 1, 15, 12, 0).getTime() - 1,
			);
			expect(result[0].description).toContain("Morning (12am-12pm)");
		});

		it("should create appropriate half-day chunk for afternoon timestamp", () => {
			const timestamps = [createDate(2024, 1, 15, 15, 30).getTime()];
			const result = createHalfDayChunks(timestamps);

			expect(result).toHaveLength(1);
			expect(result[0].startTime).toBe(
				createDate(2024, 1, 15, 12, 0).getTime(),
			);
			expect(result[0].endTime).toBe(
				createDate(2024, 1, 16, 0, 0).getTime() - 1,
			);
			expect(result[0].description).toContain("Afternoon/Evening (12pm-12am)");
		});
	});

	describe("with multiple timestamps same day", () => {
		it("should create both morning and afternoon chunks when timestamps span both", () => {
			const timestamps = [
				createDate(2024, 1, 15, 9, 0).getTime(),
				createDate(2024, 1, 15, 11, 0).getTime(),
				createDate(2024, 1, 15, 14, 0).getTime(),
				createDate(2024, 1, 15, 20, 0).getTime(),
			];
			const result = createHalfDayChunks(timestamps);

			expect(result).toHaveLength(2);

			// Morning chunk
			expect(result[0].description).toContain("Morning (12am-12pm)");
			expect(new Date(result[0].startTime).getHours()).toBe(0);
			expect(new Date(result[0].endTime).getHours()).toBe(11);

			// Afternoon chunk
			expect(result[1].description).toContain("Afternoon/Evening (12pm-12am)");
			expect(new Date(result[1].startTime).getHours()).toBe(12);
			expect(new Date(result[1].endTime).getHours()).toBe(23);
		});

		it("should create only morning chunk when all timestamps are before noon", () => {
			const timestamps = [
				createDate(2024, 1, 15, 6, 0).getTime(),
				createDate(2024, 1, 15, 9, 0).getTime(),
				createDate(2024, 1, 15, 11, 30).getTime(),
			];
			const result = createHalfDayChunks(timestamps);

			expect(result).toHaveLength(1);
			expect(result[0].description).toContain("Morning (12am-12pm)");
		});

		it("should create only afternoon chunk when all timestamps are after noon", () => {
			const timestamps = [
				createDate(2024, 1, 15, 13, 0).getTime(),
				createDate(2024, 1, 15, 18, 0).getTime(),
				createDate(2024, 1, 15, 23, 30).getTime(),
			];
			const result = createHalfDayChunks(timestamps);

			expect(result).toHaveLength(1);
			expect(result[0].description).toContain("Afternoon/Evening (12pm-12am)");
		});
	});

	describe("with multiple days", () => {
		it("should create chunks for each half-day with activity", () => {
			const timestamps = [
				// Day 1 - morning only
				createDate(2024, 1, 15, 9, 0).getTime(),
				// Day 2 - both periods
				createDate(2024, 1, 16, 10, 0).getTime(),
				createDate(2024, 1, 16, 15, 0).getTime(),
				// Day 3 - afternoon only
				createDate(2024, 1, 17, 14, 0).getTime(),
			];
			const result = createHalfDayChunks(timestamps);

			expect(result).toHaveLength(4);
			// Check dates and periods
			const date1 = new Date(2024, 0, 15).toLocaleDateString();
			const date2 = new Date(2024, 0, 16).toLocaleDateString();
			const date3 = new Date(2024, 0, 17).toLocaleDateString();

			expect(result[0].description).toContain(date1);
			expect(result[0].description).toContain("Morning");
			expect(result[1].description).toContain(date2);
			expect(result[1].description).toContain("Morning");
			expect(result[2].description).toContain(date2);
			expect(result[2].description).toContain("Afternoon/Evening");
			expect(result[3].description).toContain(date3);
			expect(result[3].description).toContain("Afternoon/Evening");
		});

		it("should skip days with no activity", () => {
			const timestamps = [
				createDate(2024, 1, 15, 10, 0).getTime(),
				// Skip day 16
				createDate(2024, 1, 17, 14, 0).getTime(),
			];
			const result = createHalfDayChunks(timestamps);

			expect(result).toHaveLength(2);
			const date1 = new Date(2024, 0, 15).toLocaleDateString();
			const date2 = new Date(2024, 0, 17).toLocaleDateString();
			expect(result[0].description).toContain(date1);
			expect(result[1].description).toContain(date2);
		});
	});

	describe("with unsorted timestamps", () => {
		it("should handle unsorted timestamps correctly", () => {
			const timestamps = [
				createDate(2024, 1, 15, 20, 0).getTime(),
				createDate(2024, 1, 15, 9, 0).getTime(),
				createDate(2024, 1, 16, 10, 0).getTime(),
				createDate(2024, 1, 15, 14, 0).getTime(),
			];
			const result = createHalfDayChunks(timestamps);

			expect(result).toHaveLength(3);
			// Should be sorted: Day 1 morning, Day 1 afternoon, Day 2 morning
			const date1 = new Date(2024, 0, 15).toLocaleDateString();
			const date2 = new Date(2024, 0, 16).toLocaleDateString();

			expect(result[0].description).toContain(date1);
			expect(result[0].description).toContain("Morning");
			expect(result[1].description).toContain(date1);
			expect(result[1].description).toContain("Afternoon/Evening");
			expect(result[2].description).toContain(date2);
			expect(result[2].description).toContain("Morning");
		});
	});

	describe("edge cases", () => {
		it("should handle timestamps exactly at noon", () => {
			const timestamps = [createDate(2024, 1, 15, 12, 0).getTime()];
			const result = createHalfDayChunks(timestamps);

			expect(result).toHaveLength(1);
			// 12:00 PM should be in afternoon chunk
			expect(result[0].description).toContain("Afternoon/Evening (12pm-12am)");
		});

		it("should handle timestamps exactly at midnight", () => {
			const timestamps = [createDate(2024, 1, 15, 0, 0).getTime()];
			const result = createHalfDayChunks(timestamps);

			expect(result).toHaveLength(1);
			// 12:00 AM should be in morning chunk
			expect(result[0].description).toContain("Morning (12am-12pm)");
		});

		it("should handle very close timestamps spanning midnight", () => {
			const timestamps = [
				createDate(2024, 1, 15, 23, 59).getTime(),
				createDate(2024, 1, 16, 0, 1).getTime(),
			];
			const result = createHalfDayChunks(timestamps);

			expect(result).toHaveLength(2);
			const date1 = new Date(2024, 0, 15).toLocaleDateString();
			const date2 = new Date(2024, 0, 16).toLocaleDateString();

			expect(result[0].description).toContain(date1);
			expect(result[0].description).toContain("Afternoon/Evening");
			expect(result[1].description).toContain(date2);
			expect(result[1].description).toContain("Morning");
		});

		it("should handle year boundaries", () => {
			const timestamps = [
				createDate(2023, 12, 31, 23, 0).getTime(),
				createDate(2024, 1, 1, 1, 0).getTime(),
			];
			const result = createHalfDayChunks(timestamps);

			expect(result).toHaveLength(2);
			const date1 = new Date(2023, 11, 31).toLocaleDateString();
			const date2 = new Date(2024, 0, 1).toLocaleDateString();

			expect(result[0].description).toContain(date1);
			expect(result[0].description).toContain("Afternoon/Evening");
			expect(result[1].description).toContain(date2);
			expect(result[1].description).toContain("Morning");
		});

		it("should handle month boundaries", () => {
			const timestamps = [
				createDate(2024, 1, 31, 20, 0).getTime(),
				createDate(2024, 2, 1, 9, 0).getTime(),
			];
			const result = createHalfDayChunks(timestamps);

			expect(result).toHaveLength(2);
			const date1 = new Date(2024, 0, 31).toLocaleDateString();
			const date2 = new Date(2024, 1, 1).toLocaleDateString();

			expect(result[0].description).toContain(date1);
			expect(result[1].description).toContain(date2);
		});

		it("should handle duplicate timestamps", () => {
			const timestamp = createDate(2024, 1, 15, 10, 0).getTime();
			const timestamps = [timestamp, timestamp, timestamp];
			const result = createHalfDayChunks(timestamps);

			expect(result).toHaveLength(1);
			expect(result[0].description).toContain("Morning");
		});

		it("should handle very large date ranges", () => {
			const timestamps = [
				createDate(2024, 1, 1, 10, 0).getTime(),
				createDate(2024, 12, 31, 15, 0).getTime(),
			];
			const result = createHalfDayChunks(timestamps);

			expect(result).toHaveLength(2);
			const date1 = new Date(2024, 0, 1).toLocaleDateString();
			const date2 = new Date(2024, 11, 31).toLocaleDateString();

			expect(result[0].description).toContain(date1);
			expect(result[1].description).toContain(date2);
		});
	});
});
