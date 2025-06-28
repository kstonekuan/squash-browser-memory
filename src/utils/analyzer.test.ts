import { describe, expect, it } from "vitest";
import type { StandardizedHistoryItem } from "../types";
import { calculateStats } from "./analyzer";

describe("calculateStats", () => {
	it("should calculate correct statistics from standardized items", () => {
		const items: StandardizedHistoryItem[] = [
			{
				timestamp: "2024-01-01T10:45:00Z",
				url: "https://github.com/microsoft/vscode",
				domain: "github.com",
				title: "GitHub - microsoft/vscode: Visual Studio Code",
			},
			{
				timestamp: "2024-01-01T10:30:00Z",
				url: "https://stackoverflow.com/questions/123456",
				domain: "stackoverflow.com",
				title: "Stack Overflow - How to center a div",
			},
			{
				timestamp: "2024-01-01T10:15:00Z",
				url: "https://github.com/facebook/react",
				domain: "github.com",
				title: "GitHub - facebook/react: A declarative, efficient...",
			},
			{
				timestamp: "2024-01-01T10:00:00Z",
				url: "https://google.com",
				domain: "google.com",
				title: "Google Search",
			},
			{
				timestamp: "2024-01-01T09:45:00Z",
				url: "https://stackoverflow.com/questions/789012",
				domain: "stackoverflow.com",
				title: "Stack Overflow - JavaScript async/await",
			},
			{
				timestamp: "2024-01-01T09:30:00Z",
				url: "https://github.com/nodejs/node",
				domain: "github.com",
				title: "GitHub - nodejs/node: Node.js JavaScript runtime",
			},
			{
				timestamp: "2024-01-01T09:15:00Z",
				url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
				domain: "mozilla.org",
				title: "MDN Web Docs - Array.prototype.map()",
			},
		];

		const stats = calculateStats(items);

		expect(stats.totalUrls).toBe(7);
		expect(stats.topDomains).toHaveLength(4);
		expect(stats.topDomains[0]).toEqual({ domain: "github.com", count: 3 });
		expect(stats.topDomains[1]).toEqual({
			domain: "stackoverflow.com",
			count: 2,
		});
		expect(stats.topDomains[2]).toEqual({ domain: "google.com", count: 1 });
		expect(stats.topDomains[3]).toEqual({ domain: "mozilla.org", count: 1 });

		expect(new Date(stats.dateRange.start).toISOString()).toBe(
			"2024-01-01T09:15:00.000Z",
		);
		expect(new Date(stats.dateRange.end).toISOString()).toBe(
			"2024-01-01T10:45:00.000Z",
		);
	});

	it("should handle empty input", () => {
		const stats = calculateStats([]);

		expect(stats.totalUrls).toBe(0);
		expect(stats.topDomains).toHaveLength(0);
		expect(stats.dateRange.start).toBeDefined();
		expect(stats.dateRange.end).toBeDefined();
		// For empty input, start and end should be the same (current time)
		expect(stats.dateRange.start).toBe(stats.dateRange.end);
	});

	it("should limit top domains to 10", () => {
		const items: StandardizedHistoryItem[] = [];

		// Create 15 different domains
		for (let i = 0; i < 15; i++) {
			items.push({
				timestamp: new Date().toISOString(),
				url: `https://domain${i}.com`,
				domain: `domain${i}.com`,
				title: `Domain ${i}`,
			});
		}

		const stats = calculateStats(items);

		expect(stats.totalUrls).toBe(15);
		expect(stats.topDomains).toHaveLength(10); // Should be limited to 10
	});

	it("should sort domains by frequency", () => {
		const items: StandardizedHistoryItem[] = [
			// 3 visits to domain1
			{
				timestamp: "2024-01-01T10:00:00Z",
				url: "https://domain1.com",
				domain: "domain1.com",
				title: "Domain 1",
			},
			{
				timestamp: "2024-01-01T10:01:00Z",
				url: "https://domain1.com",
				domain: "domain1.com",
				title: "Domain 1",
			},
			{
				timestamp: "2024-01-01T10:02:00Z",
				url: "https://domain1.com",
				domain: "domain1.com",
				title: "Domain 1",
			},
			// 1 visit to domain2
			{
				timestamp: "2024-01-01T10:03:00Z",
				url: "https://domain2.com",
				domain: "domain2.com",
				title: "Domain 2",
			},
			// 2 visits to domain3
			{
				timestamp: "2024-01-01T10:04:00Z",
				url: "https://domain3.com",
				domain: "domain3.com",
				title: "Domain 3",
			},
			{
				timestamp: "2024-01-01T10:05:00Z",
				url: "https://domain3.com",
				domain: "domain3.com",
				title: "Domain 3",
			},
		];

		const stats = calculateStats(items);

		expect(stats.topDomains[0]).toEqual({ domain: "domain1.com", count: 3 });
		expect(stats.topDomains[1]).toEqual({ domain: "domain3.com", count: 2 });
		expect(stats.topDomains[2]).toEqual({ domain: "domain2.com", count: 1 });
	});

	it("should handle invalid timestamps gracefully", () => {
		const items: StandardizedHistoryItem[] = [
			{
				timestamp: "2024-01-01T10:00:00Z",
				url: "https://example.com",
				domain: "example.com",
				title: "Example",
			},
			{
				timestamp: "invalid-date",
				url: "https://test.com",
				domain: "test.com",
				title: "Test",
			},
		];

		// This should not throw
		expect(() => calculateStats(items)).not.toThrow();

		const stats = calculateStats(items);
		expect(stats.totalUrls).toBe(2);
		expect(stats.topDomains).toHaveLength(2);
	});
});
