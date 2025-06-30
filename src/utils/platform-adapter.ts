export type PlatformType =
	| "chatgpt"
	| "claude"
	| "discord"
	| "slack"
	| "generic";

export interface PlatformConfig {
	composerActions: string[];
	chatInput: string[];
	buttonClass: string;
	insertionMethod: "append" | "replace" | "insert";
	styling: {
		buttonStyles: string;
		iconSize: string;
		textClass?: string;
	};
}

export interface ChatInputInfo {
	element: HTMLElement;
	type: "textarea" | "contenteditable" | "input";
	getCurrentText: () => string;
	insertText: (text: string) => void;
	addInputListener: (callback: (text: string) => void) => void;
}

export class PlatformAdapter {
	private static instance: PlatformAdapter | null = null;
	private currentPlatform: PlatformType;
	private config: PlatformConfig;

	constructor() {
		this.currentPlatform = this.detectPlatform();
		this.config = this.getConfig(this.currentPlatform);
		console.log(`Platform detected: ${this.currentPlatform}`);
	}

	static getInstance(): PlatformAdapter {
		if (!PlatformAdapter.instance) {
			PlatformAdapter.instance = new PlatformAdapter();
		}
		return PlatformAdapter.instance;
	}

	// Detect current platform based on hostname and DOM structure
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

	// Get platform-specific configuration
	private getConfig(platform: PlatformType): PlatformConfig {
		const configs: Record<PlatformType, PlatformConfig> = {
			chatgpt: {
				composerActions: [
					'[data-testid="composer-footer-actions"]',
					'.flex.items-center[style*="margin-inline-end"]',
					".absolute.end-2\\.5.bottom-0.flex.items-center",
					// Fallback selectors for different ChatGPT layouts
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

	// Find the best composer actions container
	findComposerContainer(): HTMLElement | null {
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

	// Fallback strategy to find a suitable container
	private findFallbackContainer(): HTMLElement | null {
		// Look for chat input first, then find nearby button containers
		const chatInput = this.findChatInput();
		if (chatInput?.element) {
			// Look for button containers near the input
			const parent = chatInput.element.closest(
				'form, div[class*="composer"], div[class*="input"]',
			);
			if (parent) {
				const buttonContainer = parent.querySelector(
					'div[class*="button"], div[class*="action"], div[class*="toolbar"]',
				);
				if (buttonContainer) {
					return buttonContainer as HTMLElement;
				}

				// Create a container if none exists
				const container = document.createElement("div");
				container.className =
					"context-button-container flex items-center gap-2";
				parent.appendChild(container);
				return container;
			}
		}

		return null;
	}

	// Find and wrap the chat input element
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

	// Wrap chat input element with unified interface
	private wrapChatInput(element: HTMLElement): ChatInputInfo {
		const isContentEditable = element.contentEditable === "true";
		const isTextarea = element.tagName.toLowerCase() === "textarea";
		const _isInput = element.tagName.toLowerCase() === "input";

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
					// Trigger input event
					element.dispatchEvent(new Event("input", { bubbles: true }));
				} else {
					(element as HTMLInputElement | HTMLTextAreaElement).value = newText;
					// Trigger input and change events
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
						setTimeout(handler, 0); // Wait for paste to complete
					});
				}
			},
		};
	}

	// Create context button with platform-specific styling
	createContextButton(): HTMLButtonElement {
		const button = document.createElement("button");
		button.type = "button";
		button.className = this.config.styling.buttonStyles;
		button.setAttribute("aria-label", "Add context from memory");
		button.setAttribute("data-testid", "context-selection-button");

		// Add platform-specific styling
		if (this.currentPlatform === "chatgpt") {
			// Use ChatGPT's exact button styling
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
			`;

			// Add hover effects
			button.addEventListener("mouseenter", () => {
				button.style.backgroundColor =
					"var(--token-main-surface-secondary, #f9fafb)";
			});

			button.addEventListener("mouseleave", () => {
				button.style.backgroundColor = "transparent";
			});
		}

		// Add icon and text
		button.innerHTML = `
			<svg width="${this.config.styling.iconSize}" height="${this.config.styling.iconSize}" viewBox="0 0 20 20" fill="currentColor">
				<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
			</svg>
			${this.config.styling.textClass ? `<span class="${this.config.styling.textClass}">Context</span>` : ""}
		`;

		return button;
	}

	// Get current platform
	getPlatform(): PlatformType {
		return this.currentPlatform;
	}

	// Get platform config
	getPlatformConfig(): PlatformConfig {
		return this.config;
	}

	// Wait for DOM elements to be available
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

			// Wait 100ms before trying again
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		console.error("Timeout waiting for DOM elements");
		return null;
	}
}

// Utility functions for common operations
export function getPlatformAdapter(): PlatformAdapter {
	return PlatformAdapter.getInstance();
}

export function detectCurrentPlatform(): PlatformType {
	return PlatformAdapter.getInstance().getPlatform();
}
