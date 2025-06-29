import { describe, expect, it } from "vitest";
import { calculateStats, hideTrackingParams } from "./analyzer";
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

		// Verify that a smaller subset would fit within a reasonable range
		const smallSubset = largeItems.slice(0, 5); // Use even smaller subset due to enhanced prompts
		const smallHistoryData = historyData.slice(0, 5);
		const smallPrompt = buildAnalysisPrompt(smallSubset, smallHistoryData);
		const smallTokens = Math.ceil(smallPrompt.length / 3.5);

		// Enhanced prompts are longer, so we expect higher token counts but still reasonable
		expect(smallTokens).toBeLessThan(2048); // Increased limit to account for enhanced prompts
	});

	it("should calculate optimal subdivision size", () => {
		// Test the binary search logic for finding optimal size
		const TOKEN_LIMIT = 2048; // Increased for enhanced prompts
		const SAFETY_MARGIN = 200;
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

describe("hideTrackingParams", () => {
	it("should hide tracking parameters", () => {
		const params = {
			// Google Analytics
			utm_source: "newsletter",
			utm_medium: "email",
			utm_campaign: "spring_sale",
			gclid: "CjwKCAiA1MCrBhAoEiwAC2d64QTg",
			// Facebook
			fbclid: "IwAR2xGf3k4j5l6m7n8o9p0q",
			// Google Search
			ei: "ThxhaLKSKYOf4-EPwqu1qQg",
			ved: "0ahUKEwiy8b3RvJaOAxWDzzgGHcJVLYUQ4dUDCBA",
			sca_esv: "6e2c4b1adddb3c28",
			// Other tracking
			sid: "abc123def456",
			ref: "homepage",
		};

		const result = hideTrackingParams(params);

		// All tracking params should be hidden
		expect(result.utm_source).toBe("<hidden>");
		expect(result.utm_medium).toBe("<hidden>");
		expect(result.utm_campaign).toBe("<hidden>");
		expect(result.gclid).toBe("<hidden>");
		expect(result.fbclid).toBe("<hidden>");
		expect(result.ei).toBe("<hidden>");
		expect(result.ved).toBe("<hidden>");
		expect(result.sca_esv).toBe("<hidden>");
		expect(result.sid).toBe("<hidden>");
		expect(result.ref).toBe("<hidden>");
	});

	it("should preserve search queries completely", () => {
		const params = {
			q: "chrome dev cannot see ai innovations tab in settings",
			query: "how to enable chrome ai features",
			search: "javascript async await tutorial",
		};

		const result = hideTrackingParams(params);

		// Search queries should be preserved in full
		expect(result.q).toBe(
			"chrome dev cannot see ai innovations tab in settings",
		);
		expect(result.query).toBe("how to enable chrome ai features");
		expect(result.search).toBe("javascript async await tutorial");
	});

	it("should preserve all non-tracking parameters regardless of length", () => {
		const params = {
			data: "a".repeat(150), // 150 character string
			token: "b".repeat(80), // 80 character string
			short: "c".repeat(20), // 20 character string
			encoded:
				"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c", // JWT token
		};

		const result = hideTrackingParams(params);

		// All non-tracking params should be preserved in full
		expect(result.data).toBe("a".repeat(150));
		expect(result.token).toBe("b".repeat(80));
		expect(result.short).toBe("c".repeat(20));
		expect(result.encoded).toBe(params.encoded);
	});

	it("should handle mixed parameter types", () => {
		const params = {
			// Search query - should be preserved
			q: "typescript generic constraints explained with examples",
			// Tracking - should be hidden
			utm_source: "google",
			gclid: "CjwKCAiA1MCrBhAoEiwAC2d64QTg",
			// Regular params
			page: "2",
			sort: "relevance",
			filter: "last_week",
			// Long param
			description:
				"This is a very long description that exceeds one hundred characters and should be truncated to maintain reasonable token usage in the prompt",
		};

		const result = hideTrackingParams(params);

		expect(result.q).toBe(
			"typescript generic constraints explained with examples",
		);
		expect(result.utm_source).toBe("<hidden>");
		expect(result.gclid).toBe("<hidden>");
		expect(result.page).toBe("2");
		expect(result.sort).toBe("relevance");
		expect(result.filter).toBe("last_week");
		expect(result.description).toBe(
			"This is a very long description that exceeds one hundred characters and should be truncated to maintain reasonable token usage in the prompt",
		);
	});

	it("should handle empty params object", () => {
		const result = hideTrackingParams({});
		expect(result).toEqual({});
	});

	it("should be case-insensitive for tracking params", () => {
		const params = {
			UTM_SOURCE: "facebook",
			Utm_Medium: "social",
			GCLID: "abc123",
			SID: "session123",
		};

		const result = hideTrackingParams(params);

		expect(result.UTM_SOURCE).toBe("<hidden>");
		expect(result.Utm_Medium).toBe("<hidden>");
		expect(result.GCLID).toBe("<hidden>");
		expect(result.SID).toBe("<hidden>");
	});

	it("should handle params with prefix patterns", () => {
		const params = {
			ga_session_id: "12345",
			ga_client_id: "67890",
			fb_pixel_id: "abcdef",
			__hssc: "tracking_value",
			__hstc: "another_tracking_value",
		};

		const result = hideTrackingParams(params);

		expect(result.ga_session_id).toBe("<hidden>");
		expect(result.ga_client_id).toBe("<hidden>");
		expect(result.fb_pixel_id).toBe("<hidden>");
		expect(result.__hssc).toBe("<hidden>");
		expect(result.__hstc).toBe("<hidden>");
	});

	it("should handle real Google search URL params", () => {
		// Real params from the example URL
		const params = {
			q: "chrome dev cannot see ai innocations tab in settings",
			sca_esv: "6e2c4b1adddb3c28",
			ei: "ThxhaLKSKYOf4-EPwqu1qQg",
			ved: "0ahUKEwiy8b3RvJaOAxWDzzgGHcJVLYUQ4dUDCBA",
			uact: "5",
			oq: "chrome dev cannot see ai innocations tab in settings",
			gs_lp:
				"Egxnd3Mtd2l6LXNlcnAiNGNocm9tZSBkZXYgY2Fubm90IHNlZSBhaSBpbm5vY2F0aW9ucyB0YWIgaW4gc2V0dGluZ3MyBxAhGKABGAoyBxAhGKABGAoyBxAhGKABGAoyBxAhGKABGApIuDdQ9gNYqjZwAngAkAEBmAGnAqAB2j6qAQgzMS4yMy4xMrgBA8gBAPgBAZgCM6ACqTjCAgoQABiwAxjWBBhHwgIEECEYFcICCxAAGIAEGJECGIoFwgIKEAAYgAQYsQMYCsICChAuGIAEGLEDGArCAgcQABiABBgKwgIQEC4YgAQYsQMY0QMYxwEYCsICBRAuGIAEwgIIEAAYgAQYsQPCAg4QLhiABBixAxjRAxjHAcICCBAuGIAEGLEDwgIFEAAYgATCAgYQABgWGB7CAggQABgWGAoYHsICCxAAGIAEGIYDGIoFwgIIEAAYgAQYogTCAgUQABjvBcICCBAAGKIEGIkFwgIFECEYoAGYAwDiAwUSATEgQIgGAZAGCJIHCjE3LjIyLjExLjGgB-3sArIHCjE1LjIyLjExLjG4B504wgcHMi4zMS4xOMgHjgE",
			sclient: "gws-wiz-serp",
			sei: "qBxhaKShA86d4-EP6K3H8Q4",
		};

		const result = hideTrackingParams(params);

		// Search query should be preserved
		expect(result.q).toBe(
			"chrome dev cannot see ai innocations tab in settings",
		);
		expect(result.oq).toBe(
			"chrome dev cannot see ai innocations tab in settings",
		);

		// All tracking params should be hidden
		expect(result.sca_esv).toBe("<hidden>");
		expect(result.ei).toBe("<hidden>");
		expect(result.ved).toBe("<hidden>");
		expect(result.uact).toBe("<hidden>");
		expect(result.gs_lp).toBe("<hidden>");
		expect(result.sclient).toBe("<hidden>");
		expect(result.sei).toBe("<hidden>");
	});
});
