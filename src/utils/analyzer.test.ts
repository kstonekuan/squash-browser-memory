import { describe, expect, it } from "vitest";
import { calculateStats } from "./analyzer";

describe("calculateStats", () => {
	it("should calculate stats for empty array", () => {
		const result = calculateStats([]);
		expect(result.totalUrls).toBe(0);
		expect(result.topDomains).toHaveLength(0);
		expect(result.dateRange.start).toBeInstanceOf(Date);
		expect(result.dateRange.end).toBeInstanceOf(Date);
	});

	it("should calculate domain frequencies", () => {
		const items: chrome.history.HistoryItem[] = [
			{
				id: "1",
				url: "https://github.com/user/repo",
				title: "GitHub",
				lastVisitTime: Date.now(),
				visitCount: 1,
			},
			{
				id: "2",
				url: "https://github.com/user/another",
				title: "GitHub",
				lastVisitTime: Date.now(),
				visitCount: 1,
			},
			{
				id: "3",
				url: "https://google.com",
				title: "Google",
				lastVisitTime: Date.now(),
				visitCount: 1,
			},
		];

		const result = calculateStats(items);
		expect(result.totalUrls).toBe(3);
		expect(result.topDomains).toHaveLength(2);
		expect(result.topDomains[0]).toEqual({ domain: "github.com", count: 2 });
		expect(result.topDomains[1]).toEqual({ domain: "google.com", count: 1 });
	});

	it("should calculate date range", () => {
		const now = Date.now();
		const yesterday = now - 24 * 60 * 60 * 1000;

		const items: chrome.history.HistoryItem[] = [
			{
				id: "1",
				url: "https://example.com",
				title: "Example",
				lastVisitTime: yesterday,
				visitCount: 1,
			},
			{
				id: "2",
				url: "https://example.com",
				title: "Example",
				lastVisitTime: now,
				visitCount: 1,
			},
		];

		const result = calculateStats(items);
		expect(result.dateRange.start.getTime()).toBe(yesterday);
		expect(result.dateRange.end.getTime()).toBe(now);
	});

	it("should handle invalid URLs gracefully", () => {
		const items: chrome.history.HistoryItem[] = [
			{
				id: "1",
				url: "not-a-valid-url",
				title: "Invalid",
				lastVisitTime: Date.now(),
				visitCount: 1,
			},
			{
				id: "2",
				url: "https://valid.com",
				title: "Valid",
				lastVisitTime: Date.now(),
				visitCount: 1,
			},
		];

		const result = calculateStats(items);
		expect(result.totalUrls).toBe(2);
		expect(result.topDomains).toHaveLength(1);
		expect(result.topDomains[0]).toEqual({ domain: "valid.com", count: 1 });
	});

	it("should limit top domains to 10", () => {
		const items: chrome.history.HistoryItem[] = [];
		for (let i = 0; i < 15; i++) {
			items.push({
				id: `${i}`,
				url: `https://domain${i}.com`,
				title: `Domain ${i}`,
				lastVisitTime: Date.now(),
				visitCount: 1,
			});
		}

		const result = calculateStats(items);
		expect(result.topDomains).toHaveLength(10);
	});
});
