# Squash SDK

[![npm version](https://badge.fury.io/js/squash-sdk.svg)](https://www.npmjs.com/package/squash-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Official JavaScript/TypeScript SDK for integrating with the Squash browser extension. Enable your web applications to access rich browsing context and build personalized experiences with user permission.

## Prerequisites

- Users must have the [Squash Chrome Extension](https://chromewebstore.google.com/detail/squash-browser-memory-for/cbemgpconhoibnbbgjbeengcojcoeimh) installed

## Installation

### For Modern Applications (Recommended)

```bash
npm install squash-sdk
# or
yarn add squash-sdk
# or
pnpm add squash-sdk
```

Then import in your React/Vue/Angular app:
```javascript
import { squash } from 'squash-sdk';
```

### For Simple HTML Sites

If you're not using a build tool, you can include via CDN:

```html
<script src="https://unpkg.com/squash-sdk@latest/dist/squash-sdk.min.js"></script>
<script>
  // SDK available as window.squash
  window.addEventListener('load', async () => {
    await squash.init({ 
      appName: 'My App',
      appId: 'my-app'
    });
  });
</script>
```

**Note:** The CDN method is only recommended for simple sites without build tools. For React, Next.js, or any modern framework, use npm.

## Quick Start

```javascript
import { squash } from 'squash-sdk';

// Initialize the SDK and request permission
const initResult = await squash.init({
  appName: 'My App',
  appId: 'my-app-unique-id'
});

if (initResult.permissionGranted) {
  // Get browsing context
  const result = await squash.getContext({
    relevanceQuery: 'coding, development',
    timeRange: '7d'
  });
  
  if (result.status === 'success') {
    console.log('User context:', result.context.summary);
    // Use context to personalize your app
  }
}
```

## Features

- 🚀 **Simple Integration** - Just two function calls to get started
- 🔒 **Privacy-First** - Users control their data with granular permissions
- 🎭 **Mock Mode** - Built-in mock data for development
- 📦 **TypeScript Support** - Full type definitions included
- 🎨 **UI Components** - Beautiful install prompts and permission dialogs
- 📊 **Analytics Ready** - Track usage and adoption

## Core Concepts

### User Context Structure

The SDK provides structured data about user browsing patterns:

```typescript
interface Context {
  summary: string;              // AI-generated user profile summary
  patterns: Pattern[];          // Detected behavioral patterns
  topics: Topic[];              // User interests and topics
  recentActivities: Activity[]; // Recent browsing activities
}

interface Pattern {
  name: string;
  description: string;
  frequency: number;
  lastSeen: number;
}

interface Topic {
  topic: string;
  relevance: number;
  keywords: string[];
}
```

### Permission Model

- Users must explicitly grant permission to each domain
- Permissions are stored per-domain and can be revoked anytime
- The SDK handles the permission flow automatically
- First-time users see a permission dialog with your app name

## API Reference

### `squash.init(config)`

Initialize the SDK and request permission from the user.

```typescript
const result = await squash.init({
  appName: 'My App',        // Required: Your app's display name
  appId: 'my-app',          // Required: Unique identifier
  installPrompt: true,      // Show install prompt if extension missing
  mockMode: false,          // Use mock data in development
  analytics: true,          // Enable usage analytics
  theme: 'auto'             // UI theme: 'light', 'dark', 'auto'
});
```

Returns:
```typescript
{
  initialized: boolean;
  extensionInstalled: boolean;
  permissionGranted: boolean;
  version?: string;
  isFirstTime: boolean;
}
```

### `squash.getContext(options?)`

Retrieve browsing context after successful initialization.

```typescript
const result = await squash.getContext({
  relevanceQuery: 'project management, agile',  // Filter by topics
  timeRange: '7d',                               // Time window
  maxTokens: 2000,                               // Token limit
  format: 'structured'                           // Response format
});
```

Returns:
```typescript
{
  status: 'success' | 'not_initialized' | 'not_installed' | 'permission_denied' | 'error';
  context?: {
    summary: string;
    patterns: Pattern[];
    topics: Topic[];
    recentActivities: Activity[];
  };
  metadata: {
    generatedAt: number;
    version: string;
    tokenCount: number;
    isMockData?: boolean;
  };
}
```

### Helper Methods

```typescript
// Check if extension is installed
const isInstalled = await squash.isExtensionInstalled();

// Show custom install prompt
await squash.showInstallPrompt({
  title: 'Custom title',     // Optional
  message: 'Custom message', // Optional  
  theme: 'dark'             // Optional: 'light', 'dark', or 'auto'
});

// Enable mock mode for development
squash.enableMockMode();

// Track custom events (if analytics enabled)
squash.trackEvent('feature_used', { feature: 'context_enhancement' });
```

## Examples

### Basic Integration

```javascript
import { squash } from 'squash-sdk';

async function enhanceAIPrompt(userInput) {
  // Initialize once when your app loads
  await squash.init({ 
    appName: 'ChatBot Pro',
    appId: 'chatbot-pro' 
  });
  
  // Get context when needed
  const result = await squash.getContext();
  
  if (result.status === 'success') {
    // Enhance the prompt with user context
    return `Context: ${result.context.summary}\n\nUser: ${userInput}`;
  }
  
  // Fallback to regular prompt
  return userInput;
}
```

### React Hook

```typescript
import { useState, useEffect } from 'react';
import squash from 'squash-sdk';

function useSquashContext() {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function initialize() {
      try {
        await squash.init({
          appName: 'My React App',
          appId: 'my-react-app'
        });
        
        const result = await squash.getContext();
        if (result.status === 'success') {
          setContext(result.context);
        } else {
          setError(result.status);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    
    initialize();
  }, []);

  return { context, loading, error };
}
```

### Development with Mock Data

```javascript
import { squash } from 'squash-sdk';

// Enable mock mode in development
if (process.env.NODE_ENV === 'development') {
  squash.enableMockMode();
}

// Use normally - will return realistic mock data
const result = await squash.getContext();
console.log(result.context); // Mock data that looks real
```

### Domain-Specific Context

```javascript
// Get context relevant to project management
const result = await squash.getContext({
  relevanceQuery: 'jira, github, agile, scrum',
  timeRange: '7d',
  maxTokens: 1500
});

if (result.status === 'success') {
  const pmPatterns = result.context.patterns.filter(p => 
    p.name.toLowerCase().includes('project')
  );
  console.log('Project management patterns:', pmPatterns);
}
```

## Framework Examples

### React Integration

See [examples/npm-usage-example.js](./examples/npm-usage-example.js) for a complete React example.

### Next.js Integration

See [examples/next-js-example.tsx](./examples/next-js-example.tsx) for Next.js with TypeScript.

### Vanilla JavaScript

See [examples/vanilla-npm-example.js](./examples/vanilla-npm-example.js) for plain JavaScript usage.

### Interactive Demo

Try the SDK in your browser: [examples/demo.html](./examples/demo.html)

## Best Practices

1. **Initialize Once**: Call `init()` once when your app loads, not on every context request
2. **Cache Context**: Store context data to minimize API calls
3. **Handle All States**: Always handle the different status responses
4. **Progressive Enhancement**: Your app should work without the extension
5. **Respect Privacy**: Only request context when needed for functionality

## TypeScript Support

The SDK includes full TypeScript definitions. Import types as needed:

```typescript
import { squash, Context, Pattern, Topic, SquashConfig, ContextOptions } from 'squash-sdk';
```

## Error Handling

Always handle different status cases:

```javascript
const result = await squash.getContext();

switch (result.status) {
  case 'success':
    // Use the context
    break;
  case 'not_initialized':
    // Call squash.init() first
    break;
  case 'not_installed':
    // Show install prompt or fallback
    break;
  case 'permission_denied':
    // User denied access, use fallback
    break;
  case 'error':
    // Handle unexpected errors
    console.error(result.error);
    break;
}
```

## Troubleshooting

### Extension Not Detected

```javascript
if (!await squash.isExtensionInstalled()) {
  // Show built-in install prompt
  await squash.showInstallPrompt();
  
  // Or direct user to install page
  window.open('https://chromewebstore.google.com/detail/squash-browser-memory-for/cbemgpconhoibnbbgjbeengcojcoeimh');
}
```

### Permission Denied

Users may deny permission on first request. Handle gracefully:

```javascript
if (result.status === 'permission_denied') {
  // Use fallback behavior
  // Can retry init() later if needed
}
```

### Development Mode

Use mock mode during development to avoid requiring the extension:

```javascript
// Enable mock mode before initializing
squash.enableMockMode();

// Or conditionally in development
if (process.env.NODE_ENV === 'development') {
  squash.enableMockMode();
}

// Then initialize normally
await squash.init({ appName: 'My App', appId: 'my-app' });
```
## Privacy & Security

- All data access is controlled by the Squash extension
- Users must explicitly grant permission per domain
- No data is stored by the SDK
- Context is filtered to remove sensitive information

## License

MIT License - see [LICENSE](../../LICENSE) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/kstonekuan/history-checker/issues)
- **Discussions**: [GitHub Discussions](https://github.com/kstonekuan/history-checker/discussions)
- **NPM Package**: [squash-sdk on npm](https://www.npmjs.com/package/squash-sdk)
- **Extension**: [Chrome Web Store](https://chromewebstore.google.com/detail/squash-browser-memory-for/cbemgpconhoibnbbgjbeengcojcoeimh)