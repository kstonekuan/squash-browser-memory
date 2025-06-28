# History Workflow Analyzer

This application analyzes your browser history to identify repetitive workflows and suggest optimizations. You can upload or paste your Chrome history export (JSON) or other browser history (as text) and the tool will use AI to find patterns.

## Features

*   **Analyze Browser History**: Supports Chrome history exports (JSON) and generic text-based history.
*   **AI-Powered Analysis**: Uses either Google Gemini or OpenAI models to analyze your browsing patterns.
*   **Privacy-Focused**: Your history data is processed in your browser. It is only sent to the selected AI provider for analysis and is not stored anywhere. You can use your own API key.
*   **Identify Repetitive Workflows**: Discovers recurring sequences of browsing behavior that could be automated or made more efficient.
*   **Customizable Prompts**: Advanced options to customize the prompts used for parsing and analysis.

## Getting Started

1.  Open the application in your browser.
2.  Select your preferred AI Provider (Google Gemini or OpenAI).
3.  Enter your API key for the selected provider.
4.  Upload your `history.json` file or paste your browsing history into the text area.
5.  Click "Analyze" and wait for the results.

## Development

This project is built with Svelte, TypeScript, and Vite.

### Prerequisites

*   Node.js
*   pnpm

### Installation

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    pnpm install
    ```

### Available Scripts

*   `pnpm dev`: Starts the development server.
*   `pnpm build`: Builds the application for production.
*   `pnpm preview`: Previews the production build.
*   `pnpm check`: Runs Svelte check and TypeScript compiler checks.
*   `pnpm lint`: Lints the codebase using Biome.
*   `pnpm format`: Formats the codebase using Biome.
*   `pnpm test`: Runs tests with Vitest.

## Privacy Notice

Your privacy is important. All processing of your browsing history is done locally in your browser. The data is sent directly to the AI service you choose (Google or OpenAI) for analysis and is never stored on any server. For maximum privacy, it is highly recommended to use your own API key.

## Technology Stack

*   **Frontend**: Svelte, TypeScript, Tailwind CSS
*   **Build Tool**: Vite
*   **AI**: Google Gemini API, OpenAI API
*   **Linting/Formatting**: Biome
*   **Testing**: Vitest