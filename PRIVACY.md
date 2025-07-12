# Privacy Policy for Squash

**Effective Date:** July 11, 2025
**Last Updated:** July 11, 2025

## Overview

Squash is a Chrome extension that adds an intelligent memory layer to your browser, analyzing your browsing patterns to provide contextual assistance when using AI tools. This privacy policy explains how we handle your data and protect your privacy.

## Core Privacy Principles

- **Privacy by Design**: Local processing is the default mode
- **User Control**: You choose how your data is processed
- **Transparency**: Clear disclosure of all data handling practices
- **Minimal Data Collection**: We only process what's necessary for functionality

## Data Collection and Usage

### What Data We Access

**Browser History**
- We access your Chrome browsing history to analyze patterns and understand context
- This includes complete URLs (domains, paths, query parameters), page titles, exact visit timestamps, and visit counts
- Used to create detailed user profiles including interests, work patterns, current tasks, and behavioral preferences

**Stored Preferences**
- Your AI provider choice (Chrome AI or Claude API)
- Extension settings and configurations
- Analysis preferences and notification settings

**User Profile Creation**
- The extension builds detailed profiles from your browsing history
- All profile data is used to provide relevant context suggestions

### How We Process Your Data

**Local Processing (Default Mode)**
- When using Chrome's built-in AI, all analysis happens locally on your device
- Your browsing data never leaves your computer
- Results are stored locally in Chrome's storage

**Remote Processing (Opt-in Only)**
- Only occurs when you explicitly configure Claude API with your own API key
- Detailed browsing data is sent to Anthropic's servers, including complete URLs, page titles, visit timestamps, and visit frequencies
- This data is used to create comprehensive behavioral profiles including personality traits, interests, current tasks, and preferences
- You must voluntarily provide your own Claude API credentials
- You can switch back to local processing at any time

## Data Storage

**Local Storage**
- All data is stored locally in Chrome's storage system
- Includes analyzed patterns, preferences, and cached results
- Data persists only on your device and Chrome account (if syncing is enabled)

**No External Databases**
- We do not maintain external servers or databases
- No data is transmitted to our servers in any mode

## Third-Party Services

**Chrome Built-in AI**
- Processes data entirely on your device
- No external transmission of your data
- Managed by Google's privacy policies

**Anthropic Claude API (Optional)**
- Only used when you provide your own API key
- Subject to Anthropic's privacy policy and terms of service
- You control what data is sent and can disable at any time
- Data transmission occurs over secure HTTPS connections

**Supported AI Platforms**
- ChatGPT (chat.openai.com) and Claude (claude.ai)
- We inject context buttons but do not collect data from these sites
- Your interactions with these platforms are governed by their respective privacy policies

## Permissions Explanation

**History Permission**
- Required to analyze your browsing patterns
- Enables understanding of your interests and work context
- Used only for generating relevant context suggestions

**Storage Permission**
- Stores preferences and analyzed data locally
- Enables persistence of your settings across browser sessions

**Notifications Permission**
- Optional notifications for background analysis completion
- Can be disabled in extension settings
- Notifications are disabled by default

**Host Permissions**
- api.anthropic.com: Only for Claude API communication (when configured)
- AI platform domains: For injecting context assistance features

## Your Privacy Controls

**AI Provider Choice**
- Default: Chrome AI (100% local processing)
- Optional: Claude API (requires your API key for remote processing)

**Data Controls**
- Enable/disable automatic background analysis
- Control notification preferences
- Clear stored analysis data at any time
- Uninstall extension to remove all local data

**Workflow Pattern Storage**
- Feature to analyze and store workflow patterns from your browsing behavior
- Currently enabled by default but can be disabled in advanced settings
- Analyzes browsing sequences to identify work patterns and repetitive tasks

## Data Security

**Local Data Protection**
- Data stored using Chrome's secure storage APIs
- Protected by your device's security measures
- API keys are stored securely in Chrome's local storage
- Sensitive processing occurs in isolated offscreen documents

**Network Transmission**
- All external communications use HTTPS encryption
- Only occurs when using Claude API with your explicit configuration
- Tracking parameters in URLs are filtered out before transmission

## Data Retention

**Local Data**
- Retained until you clear it or uninstall the extension
- No automatic deletion or expiration

**Remote Processing**
- When using Claude API, data handling follows Anthropic's retention policies
- We do not store copies of data sent to external APIs

## Updates to This Policy

We may update this privacy policy to reflect changes in our practices or for legal compliance. Updates will be posted in this repository and reflected in the Chrome Web Store listing.

## Your Rights

- **Access**: View what data is stored locally through the extension interface
- **Control**: Enable/disable features that process your data
- **Deletion**: Clear stored data or uninstall to remove all information
- **Portability**: Export your data through browser sync or manual backup

## Contact Information

For privacy-related questions or concerns:
- GitHub Issues: [Squash Issues](https://github.com/kstonekuan/squash-browser-memory/issues/new)
- Email: victor@trysquash.dev

## Legal Compliance

This extension complies with:
- Chrome Web Store Developer Program Policies
- General Data Protection Regulation (GDPR) principles
- California Consumer Privacy Act (CCPA) principles

---

**Note**: This privacy policy applies specifically to the Squash Chrome extension. When using integrated AI services (ChatGPT, Claude), their respective privacy policies also apply to your interactions with those platforms.