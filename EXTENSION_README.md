# History Workflow Analyzer - Chrome Extension

## Building the Extension

```bash
pnpm install
pnpm run build:extension
```

This will create a `dist-extension` directory with all the files needed for the Chrome extension.

## Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked"
4. Select the `dist-extension` directory
5. The extension will be loaded and the icon will appear in your toolbar

## Using the Extension

1. Click the extension icon in your toolbar
2. The History Analyzer will open in a side panel
3. Choose your AI provider:
   - **Chrome AI (Local)**: No API key needed, runs entirely on your device (requires Chrome 131+)
   - **Google Gemini** or **OpenAI**: Enter your API key (saved securely)
4. Select a date range for your browsing history
5. Click "Analyze History" to find repetitive workflows

## Features

- **Chrome AI Integration**: Use Chrome's built-in AI (Gemini Nano) for completely local, private analysis
- **Direct History Access**: No need to export/import files - the extension reads your browsing history directly
- **Side Panel UI**: Works alongside your browsing without taking up a full tab
- **Secure Storage**: API keys are stored securely in Chrome's extension storage (not needed for Chrome AI)
- **Customizable Prompts**: Modify the AI prompts to tailor the analysis to your needs
- **Progress Tracking**: See each phase of the analysis process

## Development

For development with hot reload:
```bash
pnpm run dev
```

Then load the extension from the `dist-extension` directory and reload it when you make changes.

## Chrome AI Requirements

To use the local Chrome AI feature:
- Chrome version 131 or later (released December 2024)
- The AI model will download automatically on first use (~20MB)
- All processing happens on your device - no internet required after download

If Chrome AI is not available, you can still use Google Gemini or OpenAI with an API key.

## Privacy

- Your browsing history never leaves your device
- With Chrome AI: Complete local processing, no external API calls
- With cloud providers: Analysis is performed using your own API key
- No data is stored on any external servers