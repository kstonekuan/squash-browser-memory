# History Workflow Analyzer

An intelligent Chrome extension that analyzes your browsing history to identify repetitive workflows, discover behavioral patterns, and suggest optimizations.

## Features

- **Dual AI Providers**: Choose between Chrome's built-in AI (Gemini Nano) for 100% local, private analysis or a remote provider (Anthropic's Claude) for more powerful insights.
- **Context Injection on AI Chat Platforms**: Injects a "Context" button on supported platforms (ChatGPT, Claude) to provide relevant, personalized context from your browsing history directly in your conversations.
- **Ambient Background Analysis**: Enable hourly, automatic analysis of your recent browsing history. The extension works quietly in the background to find patterns without interrupting you.
- **Incremental Learning with Memory**: The extension remembers past analyses and builds a long-term understanding of your habits, leading to smarter, more refined suggestions over time.
- **Advanced Settings**:
    - Switch between AI providers.
    - Customize the AI prompts used for analysis, data chunking, and memory integration.
    - Configure API keys for remote providers.
    - Manage ambient analysis settings and notifications.
- **Robust & Resilient**: Designed with intelligent error handling, including automatic retries, fallbacks, and a keepalive mechanism to ensure the analysis process is not interrupted.
- **Privacy-First Design**: Your data stays on your device by default. The extension provides clear warnings and requires explicit consent before using any remote service.
- **Side Panel UI**: A clean and intuitive interface that works alongside your browsing without needing a full tab.

## How It Works

The extension analyzes your history in the background using a multi-stage pipeline that runs in a dedicated offscreen document for stability.

1.  **Fetch & Chunk**: Browsing history is collected and intelligently grouped into browsing sessions using AI.
2.  **Analyze & Learn**: Each session is analyzed to identify patterns. These findings are integrated with a long-term memory to build a profile of your habits over time.
3.  **Inject & Display**: The discovered patterns and profile are used to provide contextual suggestions on AI chat platforms and are displayed in the extension's side panel.

## Context Injection on AI Chat Platforms

This extension enhances your experience on supported AI chat platforms (currently ChatGPT and Claude) by adding a "Context" button to the chat interface. This button allows you to seamlessly inject relevant information from your analyzed browsing history and user profile into your conversations.

### How it Works

1.  **Button Injection**: The extension's content script identifies the chat input area on supported sites and injects a "Context" button nearby.
2.  **Contextual Suggestions**: As you type a prompt, the extension analyzes your input and suggests relevant pieces of context from your memory, such as your profession, interests, or previously identified workflow patterns.
3.  **One-Click Insertion**: You can click a suggestion to insert it directly into the chat input. You can also shift-click the main button to insert a structured summary of your user profile.

This feature helps you provide better, more personalized context to AI assistants without having to manually copy and paste information.

## Ambient Analysis

You can enable **Ambient Analysis** in the "Advanced Settings" section. When enabled, the extension will automatically:

- Run an analysis every hour on new browsing data.
- Use the same privacy-first principles as manual analysis.
- Send notifications (if enabled) on success or failure.

This feature allows the extension to proactively discover patterns without requiring you to perform manual analysis.

## MCP Server Integration (Coming Soon)

Soon, you'll be able to expose your browsing patterns and profile as an MCP (Model Context Protocol) server. This exciting feature will allow other AI tools and applications to understand your work patterns, preferences, and habits.

### Planned Features:
- **Expose User Profile**: Share your profession, interests, and work patterns with authorized tools
- **Pattern API**: Allow other tools to query your repetitive workflows and habits
- **Privacy Controls**: Fine-grained control over what data is exposed
- **Integration Examples**: Use your browsing patterns to enhance coding assistants, productivity tools, and more

This feature will enable a new level of personalization across your AI-powered tools, all while maintaining your privacy and control over your data.

## Installation

1.  Clone the repository.
2.  Install dependencies: `pnpm install`
3.  Build the extension: `pnpm build`
4.  Load the extension in Chrome:
    - Open `chrome://extensions/`.
    - Enable "Developer mode".
    - Click "Load unpacked" and select the `dist` folder.

## AI Providers

### 1. Chrome AI (Local)

- **How it works**: Uses Chrome's built-in AI (Gemini Nano). Your browsing history **never leaves your device**.
- **Requirements**: Chrome version 138 or later.
- **Best for**: Users who prioritize privacy and want to perform analysis without an internet connection.

### 2. Anthropic Claude (Remote)

- **How it works**: Uses the Anthropic Claude API. This sends your browsing history to Anthropic's servers.
- **Requirements**: A Claude API key from the [Anthropic Console](https://console.anthropic.com/).
- **Best for**: Users who want potentially more powerful analysis and are comfortable with their data being processed by a remote service.

## Development

For a detailed technical overview, please see [ARCHITECTURE.md](./ARCHITECTURE.md).

### Prerequisites

- Node.js
- pnpm
- Chrome 138+

### Commands

- `pnpm dev`: Start development server with hot reload.
- `pnpm build`: Run checks and build the extension.
- `pnpm check`: Run all quality checks (Biome, TypeScript, Svelte, tests).
- `pnpm test`: Run tests in watch mode.
- `pnpm test:ui`: Run tests with the Vitest UI.

## Privacy Notice

Your privacy is paramount. Please review the "AI Providers" section to understand how your data is handled. When using the local Chrome AI, your history never leaves your device. When using a remote provider, your data is sent to that provider's servers.

## Requirements & Permissions

**Requirements**
- Chrome 138 or later (for local AI features).

**Permissions**
The extension requires the following permissions:
- `history`: To read browsing history for analysis.
- `storage`: To save user settings (e.g., API keys, provider choice).
- `sidePanel`: To show the extension UI in the browser side panel.
- `alarms`: To schedule the hourly ambient analysis.
- `notifications`: To show the status of background analysis.
- `unlimitedStorage`: To store a larger amount of browsing history data and analysis results locally on your device.
- `activeTab`: Used by the content script to interact with the chat interface on supported websites.
- `offscreen`: To run the AI analysis in a separate, non-visible document.

