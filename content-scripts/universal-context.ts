// Universal content script for context button injection across platforms

import type { AnalysisMemory, WorkflowPattern } from "../src/types";
import { loadMemoryFromStorage } from "../src/utils/memory";

interface PlatformConfig {
	composerActions: string[];
	chatInput: string[];
	buttonClass: string;
	insertionMethod: "append" | "prepend" | "replace";
	styling: {
		buttonStyles: string;
		iconSize: string;
		textClass?: string;
	};
}

interface ChatInputInfo {
	element: HTMLElement;
	type: "contenteditable" | "textarea" | "input";
	getCurrentText(): string;
	insertText(text: string): void;
	addInputListener(callback: (text: string) => void): void;
}

interface ContextSuggestion {
	text: string;
	category: string;
	relevanceScore: number;
	matchType: "semantic" | "string";
	workflowPattern?: WorkflowPattern;
}

type PlatformType = "chatgpt" | "claude" | "discord" | "slack" | "generic";

class SimplePlatformAdapter {
	private currentPlatform: PlatformType;
	private config: PlatformConfig;

	constructor() {
		this.currentPlatform = this.detectPlatform();
		this.config = this.getConfig(this.currentPlatform);
		console.log(`Platform detected: ${this.currentPlatform}`);
	}

	private detectPlatform(): PlatformType {
		const hostname = window.location.hostname.toLowerCase();

		if (
			hostname.includes("chatgpt.com") ||
			hostname.includes("chat.openai.com")
		) {
			return "chatgpt";
		}
		if (hostname.includes("claude.ai")) {
			return "claude";
		}
		if (hostname.includes("discord.com")) {
			return "discord";
		}
		if (hostname.includes("slack.com")) {
			return "slack";
		}
		return "generic";
	}

	private getConfig(platform: PlatformType): PlatformConfig {
		const configs: Record<PlatformType, PlatformConfig> = {
			chatgpt: {
				composerActions: [
					'[data-testid="composer-footer-actions"]',
					'.flex.items-center[style*="margin-inline-end"]',
					".absolute.end-2\\.5.bottom-0.flex.items-center",
					'div[class*="composer"] div[class*="flex items-center"]',
					'div[class*="bottom"] div[class*="flex"]',
				],
				chatInput: [
					"#prompt-textarea",
					'[contenteditable="true"]',
					'textarea[name="prompt-textarea"]',
					'div[contenteditable="true"][data-virtualkeyboard="true"]',
				],
				buttonClass: "composer-btn",
				insertionMethod: "append",
				styling: {
					buttonStyles: "composer-btn",
					iconSize: "20",
					textClass: "ml-1.5 mr-0.5",
				},
			},
			claude: {
				composerActions: [
					// New Claude.ai interface - target the container with buttons
					".relative.flex-1.flex.items-center.gap-2.shrink.min-w-0",
					".flex.flex-row.items-center.gap-2.min-w-0",
					// Fallback selectors for older versions
					'[data-testid="composer-actions"]',
					'div[class*="composer"] div[class*="actions"]',
					'div[class*="input"] div[class*="toolbar"]',
				],
				chatInput: [
					// Look for textarea first, then contenteditable
					"textarea",
					'[contenteditable="true"]',
					'input[type="text"]',
				],
				buttonClass: "context-btn",
				insertionMethod: "append",
				styling: {
					buttonStyles: "context-btn-claude",
					iconSize: "16",
					textClass: "sr-only",
				},
			},
			discord: {
				composerActions: [
					'[class*="attachButton"]',
					'[class*="buttons"]',
					'div[class*="channelTextArea"] div[class*="buttons"]',
				],
				chatInput: [
					'[data-slate-editor="true"]',
					'div[contenteditable="true"]',
				],
				buttonClass: "context-btn",
				insertionMethod: "append",
				styling: {
					buttonStyles:
						"flex items-center justify-center w-8 h-8 rounded hover:bg-gray-600",
					iconSize: "20",
				},
			},
			slack: {
				composerActions: [
					'[data-qa="composer_toolbar"]',
					".p-composer__toolbar",
					'div[class*="composer"] div[class*="toolbar"]',
				],
				chatInput: [
					'[data-qa="message_input"]',
					'div[contenteditable="true"]',
					"textarea",
				],
				buttonClass: "context-btn",
				insertionMethod: "append",
				styling: {
					buttonStyles:
						"c-button-unstyled c-icon_button c-icon_button--size_small",
					iconSize: "16",
				},
			},
			generic: {
				composerActions: [
					'[class*="composer"]',
					'[class*="input-actions"]',
					'[class*="toolbar"]',
					'div[class*="input"] + div',
					'form div[class*="buttons"]',
				],
				chatInput: [
					"textarea",
					'[contenteditable="true"]',
					'input[type="text"]',
				],
				buttonClass: "context-btn",
				insertionMethod: "append",
				styling: {
					buttonStyles:
						"inline-flex items-center justify-center rounded p-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700",
					iconSize: "16",
				},
			},
		};

		return configs[platform];
	}

	findComposerContainer(): HTMLElement | null {
		// For ChatGPT, specifically look for the trailing actions div to inject inside it
		if (this.currentPlatform === "chatgpt") {
			const trailingActions = document.querySelector(
				'[data-testid="composer-trailing-actions"]',
			) as HTMLElement;
			if (trailingActions) {
				console.log("Found composer-trailing-actions, will inject inside it");
				return trailingActions;
			}
		}

		// For Claude.ai, look for the specific button container
		if (this.currentPlatform === "claude") {
			// Look for the container that has the plus and tools buttons
			const buttonContainer = document.querySelector(
				".relative.flex-1.flex.items-center.gap-2.shrink.min-w-0",
			) as HTMLElement;
			if (buttonContainer) {
				console.log("Found Claude button container");
				return buttonContainer;
			}

			// Fallback: look for the gap container
			const gapContainer = document.querySelector(
				".flex.flex-row.items-center.gap-2.min-w-0",
			) as HTMLElement;
			if (gapContainer) {
				console.log("Found Claude gap container");
				return gapContainer;
			}
		}

		// Try each selector in order for other platforms
		for (const selector of this.config.composerActions) {
			const element = document.querySelector(selector) as HTMLElement;
			if (element) {
				console.log(`Found composer container with selector: ${selector}`);
				return element;
			}
		}

		console.warn("No composer container found, using fallback strategy");
		return this.findFallbackContainer();
	}

	private findFallbackContainer(): HTMLElement | null {
		const chatInput = this.findChatInput();
		if (chatInput?.element) {
			const container = chatInput.element.closest(
				'form, div[class*="composer"], div[class*="input"]',
			) as HTMLElement;
			if (container) {
				const actionBar = container.querySelector(
					'div[class*="button"], div[class*="action"], div[class*="toolbar"]',
				) as HTMLElement;
				if (actionBar) return actionBar;

				// Create our own container
				const fallbackContainer = document.createElement("div");
				fallbackContainer.className =
					"context-button-container flex items-center gap-2";
				container.appendChild(fallbackContainer);
				return fallbackContainer;
			}
		}
		return null;
	}

	findChatInput(): ChatInputInfo | null {
		for (const selector of this.config.chatInput) {
			const element = document.querySelector(selector) as HTMLElement;
			if (element) {
				console.log(`Found chat input with selector: ${selector}`);
				return this.wrapChatInput(element);
			}
		}
		console.warn("No chat input found");
		return null;
	}

	private wrapChatInput(element: HTMLElement): ChatInputInfo {
		const isContentEditable = element.contentEditable === "true";
		const isTextarea = element.tagName.toLowerCase() === "textarea";

		return {
			element,
			type: isContentEditable
				? "contenteditable"
				: isTextarea
					? "textarea"
					: "input",
			getCurrentText: () => {
				if (isContentEditable) {
					return element.textContent || "";
				}
				return (element as HTMLInputElement | HTMLTextAreaElement).value || "";
			},
			insertText: (text: string) => {
				const currentText = isContentEditable
					? element.textContent || ""
					: (element as HTMLInputElement | HTMLTextAreaElement).value || "";
				const newText =
					this.config.insertionMethod === "append"
						? `${currentText} ${text}`.trim()
						: this.config.insertionMethod === "replace"
							? text
							: `${text} ${currentText}`.trim();

				if (isContentEditable) {
					element.textContent = newText;
					element.dispatchEvent(new Event("input", { bubbles: true }));
				} else {
					(element as HTMLInputElement | HTMLTextAreaElement).value = newText;
					element.dispatchEvent(new Event("input", { bubbles: true }));
					element.dispatchEvent(new Event("change", { bubbles: true }));
				}

				// Focus the input
				element.focus();
			},
			addInputListener: (callback: (text: string) => void) => {
				const handler = () => {
					const text = isContentEditable
						? element.textContent || ""
						: (element as HTMLInputElement | HTMLTextAreaElement).value || "";
					callback(text);
				};

				element.addEventListener("input", handler);
				element.addEventListener("keyup", handler);

				// For contenteditable, also listen for paste events
				if (isContentEditable) {
					element.addEventListener("paste", () => {
						setTimeout(handler, 0);
					});
				}
			},
		};
	}

	createContextButton(): HTMLButtonElement {
		const button = document.createElement("button");
		button.type = "button";
		button.id = "history-analyzer-context-button";
		button.className = this.config.styling.buttonStyles;
		button.setAttribute(
			"aria-label",
			"Add context from memory (Shift+Click for quick profile)",
		);
		button.setAttribute("data-testid", "context-selection-button");

		// Platform-specific styling
		if (this.currentPlatform === "chatgpt") {
			button.style.cssText = `
				display: flex;
				align-items: center;
				justify-content: center;
				height: 36px;
				border-radius: 18px;
				border: 1px solid var(--token-border-default, #d1d5db);
				color: var(--token-text-secondary, #6b7280);
				min-width: 32px;
				width: auto;
				padding: 8px;
				font-size: 13px;
				font-weight: 600;
				background: transparent;
				cursor: pointer;
				transition: all 0.2s;
				position: relative;
			`;

			button.addEventListener("mouseenter", () => {
				if (!button.classList.contains("active")) {
					button.style.backgroundColor =
						"var(--token-main-surface-secondary, #f9fafb)";
				}
			});

			button.addEventListener("mouseleave", () => {
				if (!button.classList.contains("active")) {
					button.style.backgroundColor = "transparent";
				}
			});
		} else if (this.currentPlatform === "claude") {
			// Claude.ai specific styling to match their button design
			button.style.cssText = `
				display: inline-flex;
				align-items: center;
				justify-content: center;
				position: relative;
				flex-shrink: 0;
				border: 0.5px solid;
				transition: all 0.2s;
				height: 32px;
				min-width: 32px;
				border-radius: 8px;
				padding: 0 7.5px;
				color: hsl(var(--text-300) / 1) !important;
				border-color: rgb(var(--border-300));
				background: transparent !important;
				cursor: pointer;
				outline-offset: 1px;
			`;

			button.addEventListener("mouseenter", () => {
				if (!button.classList.contains("active")) {
					button.style.setProperty(
						"color",
						"hsl(var(--text-200) / .9)",
						"important",
					);
					button.style.setProperty(
						"background-color",
						"hsl(var(--bg-100))",
						"important",
					);
				}
			});

			button.addEventListener("mouseleave", () => {
				if (!button.classList.contains("active")) {
					button.style.setProperty(
						"color",
						"hsl(var(--text-300) / 1)",
						"important",
					);
					button.style.setProperty(
						"background-color",
						"transparent",
						"important",
					);
				}
			});

			button.addEventListener("mousedown", () => {
				button.style.transform = "scale(0.98)";
			});

			button.addEventListener("mouseup", () => {
				button.style.transform = "scale(1)";
			});
		}

		// Add icon and text - using smaller document icon
		const iconSize = Math.max(14, parseInt(this.config.styling.iconSize) - 2); // Make it 2px smaller, minimum 14px

		button.innerHTML = `
			<svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
				<polyline points="14,2 14,8 20,8"/>
				<line x1="16" y1="13" x2="8" y2="13"/>
				<line x1="16" y1="17" x2="8" y2="17"/>
				<polyline points="10,9 9,9 8,9"/>
			</svg>
			${this.config.styling.textClass ? `<span class="${this.config.styling.textClass}">Context</span>` : ""}
		`;

		return button;
	}

	getPlatform(): PlatformType {
		return this.currentPlatform;
	}

	async waitForElements(
		timeout = 10000,
	): Promise<{ container: HTMLElement; input: ChatInputInfo } | null> {
		const startTime = Date.now();

		while (Date.now() - startTime < timeout) {
			const container = this.findComposerContainer();
			const input = this.findChatInput();

			if (container && input) {
				return { container, input };
			}

			// Wait before retrying
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		console.error("Timeout waiting for DOM elements");
		return null;
	}
}

// Enhanced string similarity function with word-level matching
function compareTwoStrings(str1: string, str2: string): number {
	if (str1 === str2) return 1;
	if (str1.length === 0 || str2.length === 0) return 0;

	const a = str1.toLowerCase().trim();
	const b = str2.toLowerCase().trim();

	// Exact match after normalization
	if (a === b) return 0.95;

	// Check if one string contains the other (substring match)
	if (a.includes(b) || b.includes(a)) {
		const lengthRatio =
			Math.min(a.length, b.length) / Math.max(a.length, b.length);
		return 0.7 + 0.2 * lengthRatio;
	}

	// Word-level matching for better accuracy
	const words1 = new Set(a.split(/\s+/).filter((w) => w.length > 2));
	const words2 = new Set(b.split(/\s+/).filter((w) => w.length > 2));

	if (words1.size > 0 && words2.size > 0) {
		const intersection = new Set([...words1].filter((w) => words2.has(w)));
		const wordSimilarity =
			(2 * intersection.size) / (words1.size + words2.size);

		// If we have significant word overlap, prefer word-based score
		if (wordSimilarity > 0.3) {
			// Get bigram similarity as well
			const bigrams1: string[] = [];
			const bigrams2: string[] = [];

			for (let i = 0; i < a.length - 1; i++) {
				bigrams1.push(a.substring(i, i + 2));
			}

			for (let i = 0; i < b.length - 1; i++) {
				bigrams2.push(b.substring(i, i + 2));
			}

			// Calculate intersection
			let bigramIntersection = 0;
			const bigrams2Copy = [...bigrams2];

			for (const bigram of bigrams1) {
				const index = bigrams2Copy.indexOf(bigram);
				if (index >= 0) {
					bigramIntersection++;
					bigrams2Copy.splice(index, 1);
				}
			}

			const bigramSimilarity =
				(2.0 * bigramIntersection) / (bigrams1.length + bigrams2.length);

			// Combine word and bigram similarities
			return Math.max(
				wordSimilarity * 0.7 + bigramSimilarity * 0.3,
				bigramSimilarity,
			);
		}
	}

	// Original bigram logic as fallback
	const bigrams1: string[] = [];
	const bigrams2: string[] = [];

	for (let i = 0; i < a.length - 1; i++) {
		bigrams1.push(a.substring(i, i + 2));
	}

	for (let i = 0; i < b.length - 1; i++) {
		bigrams2.push(b.substring(i, i + 2));
	}

	// Calculate intersection
	let intersection = 0;
	const union = bigrams1.length + bigrams2.length;

	for (const bigram of bigrams1) {
		const index = bigrams2.indexOf(bigram);
		if (index >= 0) {
			intersection++;
			bigrams2.splice(index, 1);
		}
	}

	return (2.0 * intersection) / union;
}

// Domain-specific keyword mappings for enhanced matching
interface DomainKeywords {
	travel: string[];
	tech: string[];
	food: string[];
	work: string[];
}

const domainKeywords: DomainKeywords = {
	travel: [
		"trip",
		"travel",
		"traveling",
		"travelling",
		"vacation",
		"visit",
		"visiting",
		"destination",
		"journey",
		"flight",
		"flights",
		"flying",
		"hotel",
		"hotels",
		"accommodation",
		"accommodations",
		"explore",
		"exploring",
		"adventure",
		"tourism",
		"tourist",
		"country",
		"city",
		"abroad",
		"international",
		"itinerary",
		"booking",
		"bookings",
		"passport",
		"visa",
		"luggage",
		"sightseeing",
		"culture",
		"local",
		"travel guide",
		"tour guide",
		"backpack",
		"backpacking",
		"departure",
		"arrival",
		"map",
		"transportation",
		"airport",
		"train",
		"bus",
		"car rental",
	],
	tech: [
		"code",
		"coding",
		"develop",
		"developer",
		"development",
		"build",
		"building",
		"program",
		"programming",
		"programmer",
		"system",
		"software",
		"app",
		"application",
		"website",
		"ai",
		"ml",
		"machine learning",
		"algorithm",
		"data",
		"database",
		"api",
		"apis",
		"framework",
		"library",
		"javascript",
		"python",
		"react",
		"typescript",
		"automation",
		"workflow",
		"optimization",
		"performance",
		"debug",
		"debugging",
		"deploy",
		"deployment",
		"server",
		"cloud",
		"architecture",
		"frontend",
		"backend",
		"fullstack",
		"tech",
		"technical",
		"bug",
		"bugs",
		"issue",
		"issues",
		"repo",
		"repository",
		"git",
		"github",
	],
	food: [
		"eat",
		"food",
		"restaurant",
		"diet",
		"meal",
		"cuisine",
		"cooking",
		"recipe",
		"vegan",
		"vegetarian",
		"organic",
		"healthy",
		"nutrition",
		"ingredients",
		"dining",
		"cafe",
		"bar",
		"kitchen",
		"chef",
		"taste",
		"flavor",
		"local food",
		"street food",
	],
	work: [
		"project",
		"task",
		"deadline",
		"meeting",
		"team",
		"collaborate",
		"productivity",
		"efficiency",
		"strategy",
		"planning",
		"research",
		"analysis",
		"report",
		"presentation",
		"goal",
		"objective",
		"milestone",
		"progress",
		"workflow",
		"process",
		"management",
	],
};

// Enhanced context with domain tags
interface EnhancedContext {
	text: string;
	category: string;
	workflowPattern?: WorkflowPattern;
	domains: string[]; // Which domains this context belongs to
}

// Simple context matcher using string similarity with domain expansion
class SimpleContextMatcher {
	private memory: AnalysisMemory | null = null;
	private preGeneratedContexts: EnhancedContext[] = [];

	async initialize(): Promise<void> {
		try {
			this.memory = await loadMemoryFromStorage();
			console.log("Simple context matcher initialized", {
				hasMemory: !!this.memory,
				hasUserProfile: !!this.memory?.userProfile,
				userProfile: this.memory?.userProfile,
				memoryKeys: this.memory ? Object.keys(this.memory) : null,
				hasPatterns: !!this.memory?.patterns,
				patternsCount: this.memory?.patterns?.length || 0,
			});

			// Pre-generate contexts on initialization
			this.preGeneratedContexts = this.extractContexts();
			console.log("Context suggestions pre-generated on content script load:", {
				totalContexts: this.preGeneratedContexts.length,
				workflowPatterns: this.preGeneratedContexts.filter(
					(c) => c.category === "workflow",
				).length,
				contexts: this.preGeneratedContexts,
			});
		} catch (error) {
			console.error("Failed to initialize context matcher:", error);
		}
	}

	async getSuggestions(input: string): Promise<ContextSuggestion[]> {
		if (!input || input.trim().length < 3) return [];

		// Return empty array if no user profile exists yet
		if (!this.memory?.userProfile) {
			console.log("No user profile found, returning empty suggestions");
			return [];
		}

		const suggestions: ContextSuggestion[] = [];
		const inputLower = input.toLowerCase();

		// Detect which domains the input relates to
		const inputDomains = this.detectInputDomains(inputLower);
		console.log("Detected domains for input:", inputDomains);

		// Use pre-generated contexts instead of extracting each time
		const contexts = this.preGeneratedContexts;

		for (const context of contexts) {
			try {
				// Validate context structure
				if (!context || typeof context.text !== "string" || !context.category) {
					console.warn("Invalid context item:", context);
					continue;
				}

				// Calculate string similarity - special handling for workflow patterns
				let stringSimilarity: number;
				if (context.category === "workflow" && context.workflowPattern) {
					// For workflow patterns, check both title and description, use the higher score
					const titleSimilarity = compareTwoStrings(
						inputLower,
						context.workflowPattern.pattern.toLowerCase(),
					);
					const descriptionSimilarity = compareTwoStrings(
						inputLower,
						context.text.toLowerCase(), // This is the description
					);
					stringSimilarity = Math.max(titleSimilarity, descriptionSimilarity);
				} else {
					stringSimilarity = compareTwoStrings(
						inputLower,
						context.text.toLowerCase(),
					);
				}

				// Calculate domain relevance
				const domainRelevance = this.calculateDomainRelevance(
					inputDomains,
					context.domains,
				);

				// Adjust scoring weights based on string similarity
				// Reduce domain influence when string similarity is very low
				let finalScore: number;
				if (stringSimilarity < 0.1) {
					// Very low string match - reduce domain influence significantly
					finalScore = stringSimilarity * 0.8 + domainRelevance * 0.2;
				} else if (stringSimilarity < 0.3) {
					// Low string match - reduce domain influence moderately
					finalScore = stringSimilarity * 0.7 + domainRelevance * 0.3;
				} else {
					// Normal weighting for good string matches
					finalScore = stringSimilarity * 0.6 + domainRelevance * 0.4;
				}

				// Apply identity boost - core identities get lower threshold and score boost
				const isIdentity = context.category === "identities";
				if (isIdentity) {
					finalScore = finalScore * 1.3; // 30% boost for identities
				}

				// Boost for exact word matches (important keywords)
				const contextWords = new Set(context.text.toLowerCase().split(/\s+/));
				const inputWords = inputLower.split(/\s+/).filter((w) => w.length > 3);
				const exactMatches = inputWords.filter((w) =>
					contextWords.has(w),
				).length;

				if (exactMatches > 0 && inputWords.length > 0) {
					// Add up to 10% bonus for exact word matches
					const wordMatchBonus = Math.min(
						0.1,
						0.05 * (exactMatches / inputWords.length),
					);
					finalScore = Math.min(1.0, finalScore + wordMatchBonus);
				}

				// Dynamic threshold based on category
				const threshold = isIdentity ? 0.15 : 0.2; // Lower threshold for identities
				const stringThreshold = isIdentity ? 0.2 : 0.3; // Lower string threshold for identities

				if (finalScore >= threshold || stringSimilarity >= stringThreshold) {
					const matchType = domainRelevance > 0.5 ? "semantic" : "string";

					suggestions.push({
						text: context.text,
						category: context.category,
						relevanceScore: finalScore,
						matchType: matchType,
						workflowPattern: context.workflowPattern,
					});
				}
			} catch (error) {
				console.error("Error processing context:", context, error);
			}
		}

		// Sort all suggestions by relevance first
		const sortedSuggestions = suggestions
			.filter((suggestion) => suggestion.relevanceScore >= 0.1) // Minimum 10% match
			.sort((a, b) => b.relevanceScore - a.relevanceScore);

		// Dynamic limit: include all high-relevance matches (>40%)
		// and fill up to 8 total with lower relevance matches
		const highRelevanceThreshold = 0.4;
		const minSuggestions = 8;

		// Get all high relevance suggestions (no limit)
		const highRelevanceSuggestions = sortedSuggestions.filter(
			(s) => s.relevanceScore >= highRelevanceThreshold,
		);

		// If we have fewer than 8 high relevance matches,
		// fill with lower relevance ones (between 10-25%)
		if (highRelevanceSuggestions.length < minSuggestions) {
			const lowerRelevanceSuggestions = sortedSuggestions
				.filter((s) => s.relevanceScore < highRelevanceThreshold)
				.slice(0, minSuggestions - highRelevanceSuggestions.length);

			return [...highRelevanceSuggestions, ...lowerRelevanceSuggestions];
		}

		// If we have 8 or more high relevance matches, return all of them
		return highRelevanceSuggestions;
	}

	private detectInputDomains(inputLower: string): string[] {
		const detectedDomains = new Set<string>();
		const inputWords = new Set(inputLower.split(/\s+/));

		for (const [domain, keywords] of Object.entries(domainKeywords)) {
			for (const keyword of keywords) {
				const keywordLower = keyword.toLowerCase();

				// Check for exact word match first (fastest)
				if (inputWords.has(keywordLower)) {
					detectedDomains.add(domain);
					continue;
				}

				// For multi-word keywords, check substring
				if (keyword.includes(" ")) {
					if (inputLower.includes(keywordLower)) {
						detectedDomains.add(domain);
					}
				} else if (keywordLower.length > 3) {
					// For single words > 3 chars, use word boundary check
					const regex = new RegExp(`\\b${keywordLower}\\b`, "i");
					if (regex.test(inputLower)) {
						detectedDomains.add(domain);
					}
				}
			}
		}

		return Array.from(detectedDomains);
	}

	private calculateDomainRelevance(
		inputDomains: string[],
		contextDomains: string[],
	): number {
		if (inputDomains.length === 0 || contextDomains.length === 0) {
			return 0;
		}

		// Calculate overlap between input domains and context domains
		const overlap = inputDomains.filter((domain) =>
			contextDomains.includes(domain),
		);
		return (
			overlap.length / Math.max(inputDomains.length, contextDomains.length)
		);
	}

	private assignDomainsToContext(text: string, category: string): string[] {
		const domains: string[] = [];
		const textLower = text.toLowerCase();

		// Check each domain's keywords against the context text
		for (const [domain, keywords] of Object.entries(domainKeywords)) {
			for (const keyword of keywords) {
				// Use word boundary matching for better precision
				const keywordLower = keyword.toLowerCase();
				const regex = new RegExp(`\\b${keywordLower}\\b`, "i");

				if (regex.test(text)) {
					if (!domains.includes(domain)) {
						domains.push(domain);
					}
				}
			}
		}

		// Add domain based on category-specific rules
		switch (category) {
			case "identities":
				if (textLower.includes("traveler") || textLower.includes("travel")) {
					domains.push("travel");
				}
				if (
					textLower.includes("professional") ||
					textLower.includes("engineer") ||
					textLower.includes("tech")
				) {
					domains.push("tech");
				}
				break;
			case "preferences":
				if (
					textLower.includes("vegan") ||
					textLower.includes("vegetarian") ||
					textLower.includes("diet")
				) {
					domains.push("food");
				}
				if (
					textLower.includes("workflow") ||
					textLower.includes("automation") ||
					textLower.includes("systematic")
				) {
					domains.push("tech", "work");
				}
				break;
			case "tasks":
				if (
					textLower.includes("plan") &&
					(textLower.includes("tokyo") ||
						textLower.includes("paris") ||
						textLower.includes("trip"))
				) {
					domains.push("travel");
				}
				if (textLower.includes("research") && textLower.includes("ai")) {
					domains.push("tech");
				}
				break;
			case "interests":
				if (textLower.includes("travel")) {
					domains.push("travel");
				}
				if (
					textLower.includes("ai") ||
					textLower.includes("automation") ||
					textLower.includes("engineering")
				) {
					domains.push("tech");
				}
				break;
		}

		return [...new Set(domains)]; // Remove duplicates
	}

	private extractContexts(): EnhancedContext[] {
		const contexts: EnhancedContext[] = [];

		if (!this.memory?.userProfile) return contexts;

		const profile = this.memory.userProfile;

		// Helper function to safely add context with domain assignment
		const addContext = (
			value: unknown,
			category: string,
			workflowPattern?: WorkflowPattern,
		) => {
			if (value && typeof value === "string" && value.trim()) {
				const text = value.trim();
				const domains = this.assignDomainsToContext(text, category);
				contexts.push({ text, category, domains, workflowPattern });
			}
		};

		// Helper function to safely add array items (for string arrays)
		const addArrayItems = (array: unknown, category: string) => {
			if (Array.isArray(array)) {
				for (const item of array) {
					addContext(item, category);
				}
			}
		};

		// Helper function to add object arrays with specific property extraction
		const addObjectArray = (
			array: unknown,
			category: string,
			textExtractor: (item: unknown) => string,
		) => {
			if (Array.isArray(array)) {
				for (const item of array) {
					if (item && typeof item === "object") {
						const text = textExtractor(item);
						addContext(text, category);
					}
				}
			}
		};

		// Add core identities (string array)
		addArrayItems(profile.stableTraits.coreIdentities, "identities");

		// Add current tasks (string array)
		addArrayItems(profile.dynamicContext.currentTasks, "tasks");

		// Add current interests (string array)
		addArrayItems(profile.dynamicContext.currentInterests, "interests");

		// Add personal preferences (object array: {category, preference})
		addObjectArray(
			profile.stableTraits.personalPreferences,
			"preferences",
			(item) => {
				const obj = item as { category?: string; preference?: string };
				return `${obj.category || ""}: ${obj.preference || ""}`;
			},
		);

		// Add summary as a single context item
		addContext(profile.summary, "summary");

		// Add workflow patterns - use description for lookup, store full pattern for insertion
		if (this.memory.patterns && Array.isArray(this.memory.patterns)) {
			console.log("Processing workflow patterns:", this.memory.patterns.length);
			for (const pattern of this.memory.patterns) {
				if (pattern && typeof pattern === "object" && pattern.description) {
					const domains = this.assignDomainsToContext(
						pattern.description,
						"workflow",
					);
					contexts.push({
						text: pattern.description,
						category: "workflow",
						domains,
						workflowPattern: pattern,
					});
				}
			}
		} else {
			console.log("No workflow patterns found in memory:", {
				hasPatterns: !!this.memory?.patterns,
				isArray: Array.isArray(this.memory?.patterns),
				patterns: this.memory?.patterns,
			});
		}

		console.log("Extracted contexts:", contexts);
		return contexts;
	}

	isSemanticAvailable(): boolean {
		return false; // Simple version doesn't support semantic matching
	}

	isModelLoading(): boolean {
		return false;
	}
}

class ContextButtonInjector {
	private platformAdapter = new SimplePlatformAdapter();
	private matcher = new SimpleContextMatcher();
	private isInjected = false;
	private currentInput = "";
	private buttonElement: HTMLButtonElement | null = null;
	private dropdownElement: HTMLDivElement | null = null;
	private chatInput: ChatInputInfo | null = null;
	private retryCount = 0;
	private maxRetries = 20;
	private retryInterval = 500; // ms
	private updateTimeout: number | null = null;

	constructor() {
		console.log(
			`Context button injector starting for: ${this.platformAdapter.getPlatform()}`,
		);
		this.initialize();
	}

	private async initialize() {
		// Wait for DOM to be ready and React hydration to complete
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", () =>
				this.waitForHydration(),
			);
		} else {
			this.waitForHydration();
		}

		// Also try injection when the page changes (for SPAs)
		this.observePageChanges();
	}

	private async waitForHydration() {
		// For React apps like ChatGPT, wait for hydration to complete
		// This prevents hydration mismatch errors

		// Method 1: Wait for specific ChatGPT elements to be interactive
		const waitForChatGPTReady = async (): Promise<boolean> => {
			let attempts = 0;
			const maxAttempts = 30; // 3 seconds max wait

			while (attempts < maxAttempts) {
				// Look for ChatGPT-specific interactive elements that indicate hydration is complete
				const composer = document.querySelector(
					'[data-testid="composer-footer-actions"]',
				);
				const textArea = document.querySelector(
					'#prompt-textarea, [contenteditable="true"]',
				);
				const buttons = document.querySelectorAll("button").length > 5; // ChatGPT has many buttons when loaded

				if (composer && textArea && buttons) {
					console.log("ChatGPT hydration detected via UI elements");
					return true;
				}

				await new Promise((resolve) => setTimeout(resolve, 100));
				attempts++;
			}

			return false;
		};

		// Method 2: Wait for network activity to settle (indicates page load completion)
		const waitForNetworkSettle = async (): Promise<void> => {
			return new Promise((resolve) => {
				let timeoutId: number;
				let lastActivityTime = Date.now();

				const checkActivity = () => {
					const now = Date.now();
					if (now - lastActivityTime > 1500) {
						// 1.5 seconds of no activity
						resolve();
						return;
					}
					timeoutId = window.setTimeout(checkActivity, 100);
				};

				// Listen for any network requests that might indicate ongoing hydration
				const resetTimer = () => {
					lastActivityTime = Date.now();
				};

				// Monitor various events that indicate ongoing React work
				document.addEventListener("DOMSubtreeModified", resetTimer, {
					once: false,
				});
				window.addEventListener("load", resetTimer, { once: true });

				// Start checking
				timeoutId = window.setTimeout(checkActivity, 100);

				// Maximum wait time of 5 seconds
				setTimeout(() => {
					clearTimeout(timeoutId);
					resolve();
				}, 5000);
			});
		};

		// Try both methods
		const isReady = await waitForChatGPTReady();

		if (!isReady) {
			console.log("Waiting for network activity to settle...");
			await waitForNetworkSettle();
		}

		// Additional safety delay before injection
		await new Promise((resolve) => setTimeout(resolve, 500));

		console.log("React hydration appears complete, proceeding with injection");
		this.inject();
	}

	private async inject() {
		try {
			console.log("Attempting to inject context button...");

			// Check if button already exists
			const existingButton = document.getElementById(
				"history-analyzer-context-button",
			);
			if (existingButton) {
				console.log("Context button already exists, skipping injection");
				this.isInjected = true;
				this.buttonElement = existingButton as HTMLButtonElement;

				// Still need to initialize matcher and input monitoring if not done
				if (!this.chatInput) {
					const elements = await this.platformAdapter.waitForElements();
					if (elements) {
						this.chatInput = elements.input;
						await this.matcher.initialize();
						this.setupInputMonitoring();
					}
				}
				return;
			}

			// Wait for required elements to be available
			const elements = await this.platformAdapter.waitForElements();
			if (!elements) {
				this.scheduleRetry();
				return;
			}

			const { container, input } = elements;
			this.chatInput = input;

			// Create and inject the context button
			this.buttonElement = this.createContextButton();

			// Platform-specific injection logic
			if (this.platformAdapter.getPlatform() === "chatgpt") {
				// For ChatGPT, insert as first child inside trailing actions div
				const firstChild = container.firstChild;
				if (firstChild) {
					container.insertBefore(this.buttonElement, firstChild);
					console.log(
						"Context button inserted as first child in trailing actions",
					);
				} else {
					container.appendChild(this.buttonElement);
					console.log("Context button added to trailing actions (was empty)");
				}
			} else if (this.platformAdapter.getPlatform() === "claude") {
				// For Claude.ai, insert in the gap container (after existing buttons)
				const gapContainer = container.querySelector(
					".flex.flex-row.items-center.gap-2.min-w-0",
				);
				if (gapContainer) {
					gapContainer.appendChild(this.buttonElement);
					console.log("Context button added to Claude gap container");
				} else {
					// Fallback: insert at the end of the main container
					container.appendChild(this.buttonElement);
					console.log("Context button added to Claude main container");
				}
			} else {
				container.appendChild(this.buttonElement);
			}

			// Initialize context matcher
			await this.matcher.initialize();

			// Set up input monitoring
			this.setupInputMonitoring();

			this.isInjected = true;
			console.log("Context button successfully injected");
		} catch (error) {
			console.error("Failed to inject context button:", error);
			this.scheduleRetry();
		}
	}

	private scheduleRetry() {
		if (this.retryCount < this.maxRetries) {
			this.retryCount++;
			console.log(
				`Retrying injection (${this.retryCount}/${this.maxRetries}) in ${this.retryInterval}ms`,
			);
			setTimeout(() => this.inject(), this.retryInterval);
		} else {
			console.error(
				"Max retries reached, giving up on context button injection",
			);
		}
	}

	private createContextButton(): HTMLButtonElement {
		const button = this.platformAdapter.createContextButton();

		// Add click handler with shortcut support
		button.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();

			// Shift+Click = Quick insert structured profile
			if (e.shiftKey) {
				this.insertStructuredProfile();
			} else {
				// Regular click = Show dropdown suggestions
				this.toggleSuggestions();
			}
		});

		// Update button state based on current input
		this.updateButtonState(button);

		return button;
	}

	private async updateButtonState(button: HTMLButtonElement) {
		if (!this.currentInput || this.currentInput.trim().length < 3) {
			button.classList.remove("active");
			this.setButtonInactiveStyle(button);
			this.updateSuggestionCount(button, 0); // Remove count badge
			this.hideSuggestions();
			return;
		}

		try {
			const suggestions = await this.matcher.getSuggestions(this.currentInput);
			if (Array.isArray(suggestions) && suggestions.length > 0) {
				button.classList.add("active");
				this.setButtonActiveStyle(button);
				this.updateSuggestionCount(button, suggestions.length);
			} else {
				button.classList.remove("active");
				this.setButtonInactiveStyle(button);
				this.updateSuggestionCount(button, 0); // Remove count badge
			}
		} catch (error) {
			console.error("Failed to get suggestions for button state:", error, {
				currentInput: this.currentInput,
				hasMemory: !!this.matcher,
			});
			// On error, set to inactive state
			button.classList.remove("active");
			this.setButtonInactiveStyle(button);
			this.updateSuggestionCount(button, 0); // Remove count badge
		}
	}

	private setButtonActiveStyle(button: HTMLButtonElement) {
		if (this.platformAdapter.getPlatform() === "chatgpt") {
			button.style.backgroundColor = "var(--brand-purple, #ab68ff)";
			button.style.borderColor = "var(--brand-purple, #ab68ff)";
			button.style.color = "white";
		} else if (this.platformAdapter.getPlatform() === "claude") {
			button.style.setProperty(
				"background-color",
				"hsl(var(--bg-100))",
				"important",
			);
			button.style.setProperty(
				"border-color",
				"rgb(var(--border-400))",
				"important",
			);
			button.style.setProperty(
				"color",
				"hsl(var(--text-100) / 1)",
				"important",
			);
		}
	}

	private setButtonInactiveStyle(button: HTMLButtonElement) {
		if (this.platformAdapter.getPlatform() === "chatgpt") {
			button.style.backgroundColor = "transparent";
			button.style.borderColor = "var(--token-border-default, #d1d5db)";
			button.style.color = "var(--token-text-secondary, #6b7280)";
		} else if (this.platformAdapter.getPlatform() === "claude") {
			button.style.setProperty("background-color", "transparent", "important");
			button.style.setProperty(
				"border-color",
				"rgb(var(--border-300))",
				"important",
			);
			button.style.setProperty(
				"color",
				"hsl(var(--text-300) / 1)",
				"important",
			);
		}
	}

	private updateSuggestionCount(button: HTMLButtonElement, count: number) {
		// Remove existing count indicator
		const existingCount = button.querySelector(".suggestion-count");
		if (existingCount) {
			existingCount.remove();
		}

		// Add new count indicator
		if (count > 0) {
			const countElement = document.createElement("span");
			countElement.className = "suggestion-count";
			countElement.textContent = count.toString();
			countElement.style.cssText = `
				position: absolute;
				top: -4px;
				right: -4px;
				background: #ef4444;
				color: white;
				font-size: 10px;
				font-weight: bold;
				border-radius: 50%;
				width: 16px;
				height: 16px;
				display: flex;
				align-items: center;
				justify-content: center;
				line-height: 1;
				z-index: 1;
			`;
			button.appendChild(countElement);
		}
	}

	private async toggleSuggestions() {
		if (!this.currentInput || this.currentInput.trim().length < 3) {
			return;
		}

		if (this.dropdownElement && this.dropdownElement.style.display !== "none") {
			this.hideSuggestions();
		} else {
			await this.showSuggestions();
		}
	}

	private async showSuggestions() {
		if (!this.buttonElement) return;

		try {
			const suggestions = await this.matcher.getSuggestions(this.currentInput);

			// Create dropdown if it doesn't exist
			if (!this.dropdownElement) {
				this.dropdownElement = this.createSuggestionsDropdown();
			}

			this.renderSuggestions(suggestions);
			this.dropdownElement.style.display = "block";

			// Position dropdown
			this.positionDropdown();
		} catch (error) {
			console.error("Failed to show suggestions:", error);
			this.showError("Failed to load context suggestions");
		}
	}

	private hideSuggestions() {
		if (this.dropdownElement) {
			this.dropdownElement.style.display = "none";
		}
	}

	private createSuggestionsDropdown(): HTMLDivElement {
		const dropdown = document.createElement("div");
		dropdown.className = "context-suggestions-dropdown";
		dropdown.style.cssText = `
			position: fixed;
			background: white;
			border: 1px solid #e5e7eb;
			border-radius: 12px;
			box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
			max-height: 400px;
			overflow-y: auto;
			z-index: 10000;
			min-width: 320px;
			display: none;
		`;

		// Append to document body instead of button container
		document.body.appendChild(dropdown);

		// Close dropdown when clicking outside
		document.addEventListener("click", (e) => {
			if (
				!dropdown.contains(e.target as Node) &&
				!this.buttonElement?.contains(e.target as Node)
			) {
				this.hideSuggestions();
			}
		});

		return dropdown;
	}

	private renderSuggestions(suggestions: ContextSuggestion[]) {
		if (!this.dropdownElement) return;

		if (suggestions.length === 0) {
			this.dropdownElement.innerHTML = `
				<div style="padding: 16px; text-align: center; color: #6b7280;">
					<div style="font-size: 24px; margin-bottom: 8px;">💭</div>
					<div>No relevant context found</div>
				</div>
			`;
			return;
		}

		// Add header with "Insert All" button
		const headerHtml = `
			<div style="padding: 8px 12px; background: #f9fafb; border-bottom: 1px solid #f3f4f6; display: flex; justify-content: space-between; align-items: center;">
				<span style="font-size: 12px; color: #6b7280; font-weight: 500;">
					${suggestions.length} suggestion${suggestions.length !== 1 ? "s" : ""} found
				</span>
				<button 
					type="button"
					class="insert-all-btn"
					style="
						background: var(--brand-purple, #ab68ff);
						color: white;
						border: none;
						border-radius: 6px;
						padding: 4px 8px;
						font-size: 11px;
						font-weight: 600;
						cursor: pointer;
						transition: background-color 0.2s;
					"
					title="Insert structured profile (or Shift+Click context button)"
				>
					📄 Insert Profile
				</button>
			</div>
		`;

		const suggestionsHtml = suggestions
			.map((suggestion, index) => {
				const categoryIcon = this.getCategoryIcon(suggestion.category);
				const categoryColor = this.getCategoryColor(suggestion.category);
				const relevancePercent = Math.round(suggestion.relevanceScore * 100);

				return `
				<button 
					type="button" 
					class="suggestion-item" 
					data-index="${index}"
					style="
						display: block;
						width: 100%;
						padding: 12px;
						border: none;
						background: transparent;
						text-align: left;
						cursor: pointer;
						border-bottom: 1px solid #f3f4f6;
						transition: background-color 0.2s ease;
					"
				>
					<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 12px;">
						<span style="font-size: 14px;">${categoryIcon}</span>
						<span style="padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: capitalize; ${categoryColor}">
							${suggestion.category}
						</span>
						<span style="margin-left: auto; color: #6b7280; font-weight: 500;">
							${relevancePercent}%
						</span>
						<span style="padding: 1px 4px; border-radius: 3px; font-size: 9px; font-weight: 600; text-transform: uppercase; background: #fef3c7; color: #92400e;">
							${suggestion.matchType}
						</span>
					</div>
					<div style="color: #374151; font-size: 14px; line-height: 1.4; margin-top: 4px;">
						${this.escapeHtml(suggestion.text)}
					</div>
				</button>
			`;
			})
			.join("");

		this.dropdownElement.innerHTML = headerHtml + suggestionsHtml;

		// Add click handler for "Insert All" button
		const insertAllBtn = this.dropdownElement.querySelector(".insert-all-btn");
		if (insertAllBtn) {
			insertAllBtn.addEventListener("click", () => {
				this.insertStructuredProfile();
			});

			// Add hover effect
			insertAllBtn.addEventListener("mouseenter", () => {
				(insertAllBtn as HTMLElement).style.backgroundColor =
					"var(--brand-purple-dark, #9333ea)";
			});

			insertAllBtn.addEventListener("mouseleave", () => {
				(insertAllBtn as HTMLElement).style.backgroundColor =
					"var(--brand-purple, #ab68ff)";
			});
		}

		// Add click handlers and hover effects for suggestions
		this.dropdownElement
			.querySelectorAll(".suggestion-item")
			.forEach((item, index) => {
				item.addEventListener("click", () => {
					this.selectSuggestion(suggestions[index]);
				});

				// Add hover effects
				item.addEventListener("mouseenter", () => {
					(item as HTMLElement).style.backgroundColor = "#f9fafb";
				});

				item.addEventListener("mouseleave", () => {
					(item as HTMLElement).style.backgroundColor = "transparent";
				});
			});
	}

	private selectSuggestion(suggestion: ContextSuggestion) {
		if (!this.chatInput) return;

		let textToInsert = suggestion.text;

		// For workflow patterns, format the full pattern data instead of just the description
		if (suggestion.category === "workflow" && suggestion.workflowPattern) {
			const pattern = suggestion.workflowPattern;
			textToInsert = `${pattern.pattern} / Description: ${pattern.description} / Frequency: ${pattern.frequency}x / URLs: ${pattern.urls.join(", ")} / Suggestion: ${pattern.suggestion}`;
		}

		// Insert the text - insertText method already handles appending to current text
		this.chatInput.insertText(textToInsert);
		this.hideSuggestions();

		console.log("Context suggestion selected:", suggestion);
	}

	private replaceInputText(text: string) {
		if (!this.chatInput) return;

		const element = this.chatInput.element;
		const isContentEditable = element.contentEditable === "true";

		if (isContentEditable) {
			// For contentEditable divs, we need platform-specific formatting
			const platform = this.platformAdapter.getPlatform();

			if (platform === "claude" || platform === "chatgpt") {
				// Both Claude.ai and ChatGPT use <p> tags for paragraphs
				element.innerHTML = "";

				// Split text by newlines and create proper paragraph structure
				const lines = text.split(/\r?\n/);
				lines.forEach((line, _index) => {
					if (line.trim() === "") {
						// Empty line - add an empty paragraph for spacing
						const p = document.createElement("p");
						const br = document.createElement("br");
						p.appendChild(br);
						element.appendChild(p);
					} else {
						// Non-empty line - add as paragraph
						const p = document.createElement("p");
						p.textContent = line;
						element.appendChild(p);
					}
				});
			} else {
				// Other platforms - use br tags
				element.innerHTML = "";
				const lines = text.split(/\r?\n/);
				lines.forEach((line, index) => {
					if (line.trim() === "") {
						element.appendChild(document.createElement("br"));
					} else {
						const textNode = document.createTextNode(line);
						element.appendChild(textNode);
					}

					if (index < lines.length - 1) {
						element.appendChild(document.createElement("br"));
					}
				});
			}

			element.dispatchEvent(new Event("input", { bubbles: true }));
		} else {
			(element as HTMLInputElement | HTMLTextAreaElement).value = text;
			element.dispatchEvent(new Event("input", { bubbles: true }));
			element.dispatchEvent(new Event("change", { bubbles: true }));
		}

		element.focus();
	}

	private async insertStructuredProfile() {
		if (!this.chatInput) return;

		try {
			// Get only the matching suggestions for current input
			const suggestions = await this.matcher.getSuggestions(this.currentInput);

			// Convert suggestions to context format, preserving workflow pattern data
			const matchingContexts = suggestions.map((s) => ({
				text: s.text,
				category: s.category,
				workflowPattern: s.workflowPattern,
			}));

			if (matchingContexts.length === 0) {
				console.log("No matching contexts to insert");
				return;
			}

			const platform = this.platformAdapter.getPlatform();
			const formattedProfile = this.formatStructuredProfile(
				matchingContexts,
				platform,
			);

			const currentText = this.chatInput.getCurrentText();
			const separator =
				platform === "claude" || platform === "chatgpt"
					? "\n\n"
					: String.fromCharCode(0x0d, 0x0a); // Use regular newlines for Claude and ChatGPT
			const contextHeader =
				platform === "claude" || platform === "chatgpt" ? "" : "-- Context --"; // No header needed for markdown platforms
			const newText = currentText
				? currentText +
					separator +
					(contextHeader ? contextHeader + separator : "") +
					formattedProfile
				: formattedProfile;

			// Use direct replacement to avoid double-insertion
			this.replaceInputText(newText);
			this.hideSuggestions();

			console.log(
				"Structured profile inserted with",
				matchingContexts.length,
				"matching contexts",
			);
		} catch (error) {
			console.error("Failed to insert structured profile:", error);
		}
	}

	private formatStructuredProfile(
		contexts: Array<{
			text: string;
			category: string;
			workflowPattern?: WorkflowPattern;
		}>,
		platform: PlatformType,
	): string {
		const sections: string[] = [];

		// Use markdown formatting for Claude and ChatGPT
		if (platform === "claude" || platform === "chatgpt") {
			// Summary section (if available) - moved to top for better context
			const summary = contexts.find((c) => c.category === "summary")?.text;
			if (summary) {
				sections.push(`## Context`);
				sections.push("");
				sections.push(summary);
				sections.push("");
			}

			// Core identities section
			const identities = contexts.filter((c) => c.category === "identities");
			if (identities.length > 0) {
				sections.push("### Core Identities");
				identities.forEach((identity) => {
					sections.push(`- ${identity.text}`);
				});
				sections.push("");
			}

			// Personal preferences section
			const preferences = contexts.filter((c) => c.category === "preferences");
			if (preferences.length > 0) {
				sections.push("### Personal Preferences");
				preferences.forEach((pref) => {
					sections.push(`- ${pref.text}`);
				});
				sections.push("");
			}

			// Current tasks section
			const tasks = contexts.filter((c) => c.category === "tasks");
			if (tasks.length > 0) {
				sections.push("### Current Tasks");
				tasks.forEach((task) => {
					sections.push(`- ${task.text}`);
				});
				sections.push("");
			}

			// Current interests section
			const interests = contexts.filter((c) => c.category === "interests");
			if (interests.length > 0) {
				sections.push("### Current Interests");
				interests.forEach((interest) => {
					sections.push(`- ${interest.text}`);
				});
				sections.push("");
			}

			// Workflow patterns section
			const workflowPatterns = contexts.filter(
				(c) => c.category === "workflow" && c.workflowPattern,
			);
			if (workflowPatterns.length > 0) {
				sections.push("### Workflow Patterns");
				sections.push("");
				for (const context of workflowPatterns) {
					const pattern = context.workflowPattern!;
					sections.push(`**${pattern.pattern}**`);
					sections.push(`> ${pattern.description}`);
					sections.push("");
					sections.push(`- **Frequency**: ${pattern.frequency}x`);
					sections.push(`- **URLs**:`);
					pattern.urls.forEach((url) => {
						sections.push(`  - ${url}`);
					});
					sections.push(""); // Add spacing between patterns
				}
			}

			// Use regular newlines for markdown formatting
			return sections.join("\n");
		} else {
			// Original simple formatting for other platforms
			// Core identities section
			const identities = contexts.filter((c) => c.category === "identities");
			if (identities.length > 0) {
				const identityList = identities.map((i) => i.text).join(", ");
				sections.push(`Core identities: ${identityList}`);
			}

			// Summary section (if available)
			const summary = contexts.find((c) => c.category === "summary")?.text;
			if (summary) {
				sections.push(`Background: ${summary}`);
			}

			// Personal preferences section
			const preferences = contexts.filter((c) => c.category === "preferences");
			if (preferences.length > 0) {
				sections.push("Personal preferences:");
				preferences.forEach((pref) => {
					sections.push(`  - ${pref.text}`);
				});
			}

			// Current tasks section
			const tasks = contexts.filter((c) => c.category === "tasks");
			if (tasks.length > 0) {
				const taskList = tasks.map((t) => t.text).join(", ");
				sections.push(`Current tasks: ${taskList}`);
			}

			// Current interests section
			const interests = contexts.filter((c) => c.category === "interests");
			if (interests.length > 0) {
				const interestList = interests.map((i) => i.text).join(", ");
				sections.push(`Current interests: ${interestList}`);
			}

			// Workflow patterns section
			const workflowPatterns = contexts.filter(
				(c) => c.category === "workflow" && c.workflowPattern,
			);
			if (workflowPatterns.length > 0) {
				sections.push("Workflow Patterns:");
				for (const context of workflowPatterns) {
					const pattern = context.workflowPattern!;
					sections.push(`**${pattern.pattern}**`);
					sections.push(` - Description: ${pattern.description}`);
					sections.push(` - Frequency: ${pattern.frequency}x`);
					sections.push(` - URLs: ${pattern.urls.join(", ")}`);
					sections.push(""); // Add spacing between patterns
				}
			}

			// Use CRLF for other platforms
			const crlf = String.fromCharCode(0x0d, 0x0a);
			return sections.join(crlf);
		}
	}

	private positionDropdown() {
		if (!this.dropdownElement || !this.buttonElement) return;

		const buttonRect = this.buttonElement.getBoundingClientRect();
		const viewportHeight = window.innerHeight;
		const viewportWidth = window.innerWidth;
		const dropdownHeight = 400; // max-height
		const dropdownWidth = 320; // min-width

		// Position below the button by default
		let top = buttonRect.bottom + 4;
		let left = buttonRect.left;

		// If dropdown would go off bottom of screen, position above
		if (
			top + dropdownHeight > viewportHeight &&
			buttonRect.top > dropdownHeight
		) {
			top = buttonRect.top - dropdownHeight - 4;
		}

		// If dropdown would go off right side, adjust left position
		if (left + dropdownWidth > viewportWidth) {
			left = viewportWidth - dropdownWidth - 10;
		}

		// If dropdown would go off left side, adjust left position
		if (left < 10) {
			left = 10;
		}

		this.dropdownElement.style.top = `${top}px`;
		this.dropdownElement.style.left = `${left}px`;
	}

	private setupInputMonitoring() {
		if (!this.chatInput) return;

		// Monitor input changes
		this.chatInput.addInputListener((text: string) => {
			this.currentInput = text;
			if (this.buttonElement) {
				// Debounce button state updates
				if (this.updateTimeout) clearTimeout(this.updateTimeout);
				this.updateTimeout = window.setTimeout(() => {
					this.updateButtonState(this.buttonElement!);
				}, 300);
			}
		});

		console.log("Input monitoring set up");
	}

	private observePageChanges() {
		// For SPAs, re-inject when page content changes significantly
		const observer = new MutationObserver((mutations) => {
			// Only check if we think we're not injected AND the button doesn't exist
			if (
				this.isInjected &&
				document.getElementById("history-analyzer-context-button")
			) {
				return; // Button exists and we think we're injected, no need to check
			}

			let shouldReInject = false;

			for (const mutation of mutations) {
				// Check if significant DOM changes occurred
				if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
					for (const node of mutation.addedNodes) {
						if (node.nodeType === Node.ELEMENT_NODE) {
							const element = node as Element;
							// Check for chat interface elements
							if (
								element.querySelector &&
								(element.querySelector('[data-testid*="composer"]') ||
									element.querySelector('[class*="composer"]') ||
									element.querySelector("textarea") ||
									element.querySelector('[contenteditable="true"]'))
							) {
								// Only re-inject if button doesn't exist
								const existingButton = document.getElementById(
									"history-analyzer-context-button",
								);
								if (!existingButton) {
									shouldReInject = true;
								}
								break;
							}
						}
					}
				}
			}

			if (shouldReInject) {
				console.log(
					"Page structure changed and button missing, re-injecting context button",
				);
				this.isInjected = false; // Reset state
				setTimeout(() => this.inject(), 1000); // Wait for animations to complete
			}
		});

		observer.observe(document.body, {
			childList: true,
			subtree: true,
		});
	}

	private showError(message: string) {
		if (!this.dropdownElement) return;

		this.dropdownElement.innerHTML = `
			<div style="padding: 16px; text-align: center; color: #ef4444;">
				<div style="font-size: 24px; margin-bottom: 8px;">⚠️</div>
				<div>${message}</div>
			</div>
		`;
		this.dropdownElement.style.display = "block";
	}

	// Utility functions
	private getCategoryIcon(category: string): string {
		const icons: Record<string, string> = {
			goals: "🎯",
			profession: "💼",
			patterns: "🔄",
			preferences: "⚙️",
			traits: "🧠",
			interests: "✨",
			obsessions: "🔥",
			technology: "💻",
			lifecycle: "🔄",
			summary: "📋",
		};
		return icons[category] || "📝";
	}

	private getCategoryColor(category: string): string {
		const colors: Record<string, string> = {
			goals: "background: #dbeafe; color: #1e40af;",
			profession: "background: #dcfce7; color: #166534;",
			patterns: "background: #e9d5ff; color: #7c3aed;",
			preferences: "background: #fed7aa; color: #ea580c;",
			traits: "background: #e0e7ff; color: #4338ca;",
			interests: "background: #fce7f3; color: #be185d;",
			obsessions: "background: #fee2e2; color: #dc2626;",
			technology: "background: #dbeafe; color: #1d4ed8;",
			lifecycle: "background: #f3e8ff; color: #7c3aed;",
			summary: "background: #f0f9ff; color: #0369a1;",
		};
		return colors[category] || "background: #f3f4f6; color: #374151;";
	}

	private escapeHtml(text: string): string {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}
}

// Initialize the context button injector when script loads
console.log("Universal context script loaded");
new ContextButtonInjector();
