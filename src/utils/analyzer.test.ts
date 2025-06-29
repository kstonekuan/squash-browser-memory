import { describe, expect, it } from "vitest";
import { calculateStats } from "./analyzer";
import { buildAnalysisPrompt } from "./constants";

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

describe("token counting and subdivision", () => {
	it("should identify when chunks need subdivision", () => {
		// Create a large set of items that would exceed token limits
		const largeItems: chrome.history.HistoryItem[] = [];
		const longUrl =
			"https://example.com/very/long/path/with/many/segments/and/parameters?param1=value1&param2=value2&param3=value3";

		for (let i = 0; i < 50; i++) {
			largeItems.push({
				id: `${i}`,
				url: `${longUrl}&index=${i}`,
				title: `Very Long Title That Contains Many Words To Increase Token Count ${i}`,
				lastVisitTime: Date.now() - i * 1000,
				visitCount: i + 1,
			});
		}

		// Create test data to measure prompt size
		const historyData = largeItems.map((item) => ({
			d: "example.com",
			p: "/very/long/path/with/many/segments/and/parameters",
			q: {
				param1: "value1",
				param2: "value2",
				param3: "value3",
				index: item.id || "",
			},
			t: item.title || "",
			ts: item.lastVisitTime || 0,
			v: item.visitCount || 0,
		}));

		// Build the prompt to check its size
		const prompt = buildAnalysisPrompt(largeItems, historyData);

		// Token estimation: ~3.5 characters per token
		const estimatedTokens = Math.ceil(prompt.length / 3.5);

		// With 50 items, this should exceed the 1024 token limit
		expect(estimatedTokens).toBeGreaterThan(1024);

		// Verify that a smaller subset would fit
		const smallSubset = largeItems.slice(0, 10);
		const smallHistoryData = historyData.slice(0, 10);
		const smallPrompt = buildAnalysisPrompt(smallSubset, smallHistoryData);
		const smallTokens = Math.ceil(smallPrompt.length / 3.5);

		expect(smallTokens).toBeLessThan(1024);
	});

	it("should calculate optimal subdivision size", () => {
		// Test the binary search logic for finding optimal size
		const TOKEN_LIMIT = 1024;
		const SAFETY_MARGIN = 50;
		const MAX_TOKENS = TOKEN_LIMIT - SAFETY_MARGIN;

		// Helper to count tokens
		const countTokens = (text: string) => Math.ceil(text.length / 3.5);

		// Create items with known sizes
		const items: chrome.history.HistoryItem[] = [];
		for (let i = 0; i < 30; i++) {
			items.push({
				id: `${i}`,
				url: `https://example${i}.com/path${i}`,
				title: `Title ${i}`,
				lastVisitTime: Date.now() - i * 1000,
				visitCount: 1,
			});
		}

		// Simulate binary search for optimal size
		let left = 1;
		let right = items.length;
		let optimalSize = 5;

		while (left <= right) {
			const mid = Math.floor((left + right) / 2);
			const testItems = items.slice(0, mid);
			const testData = testItems.map((item) => ({
				d: new URL(item.url || "").hostname,
				p: new URL(item.url || "").pathname,
				q: undefined,
				t: item.title || "",
				ts: item.lastVisitTime || 0,
				v: item.visitCount || 0,
			}));

			const testPrompt = buildAnalysisPrompt(testItems, testData);
			const testTokenCount = countTokens(testPrompt);

			if (testTokenCount <= MAX_TOKENS) {
				optimalSize = mid;
				left = mid + 1;
			} else {
				right = mid - 1;
			}
		}

		// The optimal size should be reasonable (not too small, not too large)
		expect(optimalSize).toBeGreaterThan(0);
		expect(optimalSize).toBeLessThanOrEqual(items.length);

		// Verify the optimal size actually fits
		const optimalItems = items.slice(0, optimalSize);
		const optimalData = optimalItems.map((item) => ({
			d: new URL(item.url || "").hostname,
			p: new URL(item.url || "").pathname,
			q: undefined,
			t: item.title || "",
			ts: item.lastVisitTime || 0,
			v: item.visitCount || 0,
		}));

		const optimalPrompt = buildAnalysisPrompt(optimalItems, optimalData);
		const optimalTokenCount = countTokens(optimalPrompt);

		expect(optimalTokenCount).toBeLessThanOrEqual(MAX_TOKENS);
	});
});
