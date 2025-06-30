// Universal content script for context button injection across platforms
// Self-contained version without external dependencies

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
					'[data-testid="composer-actions"]',
					'div[class*="composer"] div[class*="actions"]',
					'div[class*="input"] div[class*="toolbar"]',
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
						"inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 w-9",
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
				insertionMethod: "insert",
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
		button.setAttribute("aria-label", "Add context from memory");
		button.setAttribute("data-testid", "context-selection-button");

		// ChatGPT specific styling
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

// Simple storage interface for Chrome extension
class SimpleStorage {
	static async getMemory(): Promise<any> {
		return new Promise((resolve) => {
			// First, let's see what's actually in storage
			chrome.storage.local.get(null, (allItems) => {
				console.log(
					"All items in chrome.storage.local:",
					Object.keys(allItems),
				);

				chrome.storage.local.get(["history_analysis_memory"], (result) => {
					console.log("Looking for history_analysis_memory:", result);
					resolve(result.history_analysis_memory || null);
				});
			});
		});
	}

	static async saveMemory(memory: any): Promise<void> {
		return new Promise((resolve) => {
			chrome.storage.local.set({ history_analysis_memory: memory }, () => {
				resolve();
			});
		});
	}
}

// Simple string similarity function
function compareTwoStrings(str1: string, str2: string): number {
	if (str1 === str2) return 1;
	if (str1.length === 0 || str2.length === 0) return 0;

	const a = str1.toLowerCase();
	const b = str2.toLowerCase();

	// Get bigrams
	const bigrams1 = [];
	const bigrams2 = [];

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

// Simple context matcher using string similarity only
class SimpleContextMatcher {
	private memory: any = null;

	async initialize(): Promise<void> {
		try {
			this.memory = await SimpleStorage.getMemory();
			console.log("Simple context matcher initialized", {
				hasMemory: !!this.memory,
				hasUserProfile: !!this.memory?.userProfile,
				userProfile: this.memory?.userProfile,
				memoryKeys: this.memory ? Object.keys(this.memory) : null,
			});
		} catch (error) {
			console.error("Failed to initialize context matcher:", error);
		}
	}

	async getSuggestions(input: string): Promise<ContextSuggestion[]> {
		if (!input || input.trim().length < 3) return [];

		// Add some sample data if no memory exists (for testing)
		if (!this.memory?.userProfile) {
			console.log("No user profile found, using sample data for demo");
			const sampleContexts = [
				{
					text: "Software engineer passionate about AI and web development",
					category: "profession",
				},
				{
					text: "Building Chrome extensions and browser automation tools",
					category: "interests",
				},
				{
					text: "Learning about React, TypeScript, and machine learning",
					category: "goals",
				},
				{
					text: "Enjoys clean code, good UX design, and efficient workflows",
					category: "preferences",
				},
				{
					text: "Problem-solver who likes optimizing developer experience",
					category: "traits",
				},
				{
					text: "Currently exploring LLM integration and semantic search",
					category: "obsessions",
				},
			];

			return this.matchSampleContexts(input, sampleContexts);
		}

		const suggestions: ContextSuggestion[] = [];
		const inputLower = input.toLowerCase();

		// Extract context from user profile
		const contexts = this.extractContexts();

		for (const context of contexts) {
			try {
				// Validate context structure
				if (!context || typeof context.text !== "string" || !context.category) {
					console.warn("Invalid context item:", context);
					continue;
				}

				const similarity = compareTwoStrings(
					inputLower,
					context.text.toLowerCase(),
				);

				if (similarity >= 0.2) {
					// 20% threshold (lowered for better matching)
					suggestions.push({
						text: context.text,
						category: context.category,
						relevanceScore: similarity,
						matchType: "string",
					});
				}
			} catch (error) {
				console.error("Error processing context:", context, error);
			}
		}

		// Sort by relevance and limit to 5
		return suggestions
			.sort((a, b) => b.relevanceScore - a.relevanceScore)
			.slice(0, 5);
	}

	private matchSampleContexts(
		input: string,
		contexts: Array<{ text: string; category: string }>,
	): ContextSuggestion[] {
		const suggestions: ContextSuggestion[] = [];
		const inputLower = input.toLowerCase();

		for (const context of contexts) {
			const similarity = compareTwoStrings(
				inputLower,
				context.text.toLowerCase(),
			);

			if (similarity >= 0.1) {
				// Even lower threshold for demo
				suggestions.push({
					text: context.text,
					category: context.category,
					relevanceScore: similarity,
					matchType: "string",
				});
			}
		}

		return suggestions
			.sort((a, b) => b.relevanceScore - a.relevanceScore)
			.slice(0, 5);
	}

	private extractContexts(): Array<{ text: string; category: string }> {
		const contexts: Array<{ text: string; category: string }> = [];

		if (!this.memory?.userProfile) return contexts;

		const profile = this.memory.userProfile;

		// Helper function to safely add context
		const addContext = (value: any, category: string) => {
			if (value && typeof value === "string" && value.trim()) {
				contexts.push({ text: value.trim(), category });
			}
		};

		// Helper function to safely add array items (for string arrays)
		const addArrayItems = (array: any, category: string) => {
			if (Array.isArray(array)) {
				for (const item of array) {
					addContext(item, category);
				}
			}
		};

		// Helper function to add object arrays with specific property extraction
		const addObjectArray = (
			array: any,
			category: string,
			textExtractor: (item: any) => string,
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

		// Add profession
		addContext(profile.profession, "profession");

		// Add interests (string array)
		addArrayItems(profile.interests, "interests");

		// Add current goals (string array)
		addArrayItems(profile.currentGoals, "goals");

		// Add lifecycle hints (string array)
		addArrayItems(profile.lifecycleHints, "lifecycle");

		// Add personal preferences (object array: {category, preference})
		addObjectArray(
			profile.personalPreferences,
			"preferences",
			(item) => `${item.category}: ${item.preference}`,
		);

		// Add personality traits (object array: {trait, evidence})
		addObjectArray(
			profile.personalityTraits,
			"traits",
			(item) => item.trait + (item.evidence ? ` (${item.evidence})` : ""),
		);

		// Add technology use (object array: {category, level, tools})
		addObjectArray(
			profile.technologyUse,
			"technology",
			(item) =>
				`${item.category} (${item.level}): ${Array.isArray(item.tools) ? item.tools.join(", ") : item.tools || ""}`,
		);

		// Add work patterns (object array: {type, description})
		addObjectArray(
			profile.workPatterns,
			"patterns",
			(item) => `${item.type}: ${item.description}`,
		);

		// Add recent obsessions (string array)
		addArrayItems(profile.recentObsessions, "obsessions");

		// Add summary as a single context item
		addContext(profile.summary, "summary");

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

			// For ChatGPT, insert as first child inside trailing actions div
			if (this.platformAdapter.getPlatform() === "chatgpt") {
				// The container is the trailing actions div itself, insert as first child
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

		// Add click handler for suggestions dropdown
		button.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.toggleSuggestions();
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
		}
	}

	private setButtonInactiveStyle(button: HTMLButtonElement) {
		if (this.platformAdapter.getPlatform() === "chatgpt") {
			button.style.backgroundColor = "transparent";
			button.style.borderColor = "var(--token-border-default, #d1d5db)";
			button.style.color = "var(--token-text-secondary, #6b7280)";
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
					<div style="font-size: 12px; margin-top: 4px;">
						String matching only (semantic search available in sidepanel)
					</div>
				</div>
			`;
			return;
		}

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

		const statusHtml = `
			<div style="padding: 8px 12px; background: #f9fafb; border-top: 1px solid #f3f4f6; font-size: 11px; color: #6b7280;">
				📝 String matching (full semantic search available in extension sidepanel)
			</div>
		`;

		this.dropdownElement.innerHTML = suggestionsHtml + statusHtml;

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

		// Insert the suggestion text into the chat input
		const currentText = this.chatInput.getCurrentText();
		const newText = currentText
			? `${currentText} ${suggestion.text}`
			: suggestion.text;

		this.chatInput.insertText(newText);
		this.hideSuggestions();

		console.log("Context suggestion selected:", suggestion);
	}

	private positionDropdown() {
		if (!this.dropdownElement || !this.buttonElement) return;

		const buttonRect = this.buttonElement.getBoundingClientRect();
		const viewportHeight = window.innerHeight;
		const viewportWidth = window.innerWidth;
		const dropdownHeight = 400; // max-height
		const dropdownWidth = 320; // min-width

		// Calculate position below the button
		let top = buttonRect.bottom + 4;
		let left = buttonRect.left;

		// Check if dropdown should open upward
		if (
			top + dropdownHeight > viewportHeight &&
			buttonRect.top > dropdownHeight
		) {
			top = buttonRect.top - dropdownHeight - 4;
		}

		// Ensure dropdown doesn't go off screen horizontally
		if (left + dropdownWidth > viewportWidth) {
			left = viewportWidth - dropdownWidth - 10;
		}

		// Ensure dropdown doesn't go off screen to the left
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
