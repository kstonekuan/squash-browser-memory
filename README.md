# History Workflow Analyzer

A Chrome extension that analyzes your browsing history to identify repetitive workflows and suggest optimizations using Chrome's built-in AI.

## Features

- **Chrome AI Integration**: Use Chrome's built-in AI (Gemini Nano) for completely local, private analysis
- **Direct History Access**: No need to export/import files - the extension reads your browsing history directly
- **Side Panel UI**: Works alongside your browsing without taking up a full tab
- **Identify Repetitive Workflows**: Discovers recurring sequences of browsing behavior that could be automated or made more efficient
- **Customizable Prompts**: Advanced options to customize the AI prompts used for analysis
- **Progress Tracking**: See each phase of the analysis process
- **Privacy-First**: Your history never leaves your device - all analysis is performed locally using Chrome AI

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Build the extension:
   ```bash
   pnpm build
   ```
4. Load the extension in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode" in the top right corner
   - Click "Load unpacked"
   - Select the `dist` folder
   - The extension will be loaded and the icon will appear in your toolbar

## Usage

1. Click the extension icon in your toolbar
2. The History Analyzer will open in a side panel
3. Select a date range for your browsing history
4. Click "Analyze History" to find repetitive workflows
5. View the identified workflow patterns and optimization suggestions

## Chrome AI Requirements

To use the local Chrome AI feature:
- Chrome version 131 or later (released December 2024)
- The AI model will download automatically on first use (~20MB)
- All processing happens on your device - no internet required after download

## Development

### Prerequisites

- Node.js
- pnpm
- Chrome 131+ (for Chrome AI features)

### Commands

- `pnpm dev` - Start development server with hot reload
- `pnpm build` - Run checks and build the extension
- `pnpm check` - Run all quality checks (Biome, TypeScript, Svelte, tests)
- `pnpm test` - Run tests in watch mode
- `pnpm test:ui` - Run tests with UI

For development with hot reload:
```bash
pnpm dev
```
Then load the extension from the `dist` directory and reload it when you make changes.

### Check Command

Always run `pnpm check` before committing or after making significant changes. This command runs:
- Biome linting and formatting
- TypeScript type checking
- Svelte checking
- Unit tests

The check command is automatically run before builds to ensure code quality.

### Build Output

- Chrome extension: `dist/`

## Technology Stack

- **Frontend**: Svelte 5, TypeScript, Tailwind CSS
- **Build Tool**: Vite
- **AI**: Chrome's built-in Language Model API (Gemini Nano)
- **Linting/Formatting**: Biome
- **Testing**: Vitest

## Privacy Notice

Your privacy is paramount:
- Your browsing history never leaves your device
- Complete local processing with Chrome AI - no external API calls
- No data is stored on any external servers
- The extension requires only the "history" permission to access your browsing history

## Requirements

- Chrome 138 or later with AI features enabled
- The extension requires the "history" permission to access your browsing history

## TODO

- Clean up Chrome Built-In AI usage instructions
- Test AI on non-dev chrome.