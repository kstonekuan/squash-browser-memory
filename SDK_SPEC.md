# Squash SDK Specification

## Overview

The Squash SDK is a lightweight JavaScript library that provides a seamless interface to the Squash browser extension's injected API. It handles all edge cases - from extension not installed to permission denied - while providing helpful fallbacks and user guidance.

## Extension API Injection

The Squash browser extension injects a global object into every webpage:

```javascript
// Injected by Squash extension into all pages
window.__squashExtension = {
  requestPermission: async (appInfo) => {
    // Shows permission dialog to user
    // Returns: { granted: boolean, isFirstTime: boolean }
  },
  getContext: async (options) => {
    // Returns browsing context if permission granted
    // Returns: { success: boolean, data?: ContextData, error?: string }
  },
  isPermissionGranted: () => {
    // Check current permission status for this domain
    // Returns: boolean
  },
  version: '1.0.0'
}
```

## Using the Raw Extension API (Without SDK)

Developers could use the injected API directly:

```javascript
// Without SDK - handle everything manually
async function getContextRaw() {
  // Check if extension exists
  if (!window.__squashExtension) {
    console.log('Squash not installed');
    return null;
  }
  
  // Check permission
  if (!window.__squashExtension.isPermissionGranted()) {
    // Request permission
    const { granted } = await window.__squashExtension.requestPermission({
      appName: 'My App',
      appId: 'my-app'
    });
    
    if (!granted) {
      console.log('Permission denied');
      return null;
    }
  }
  
  // Get context
  const result = await window.__squashExtension.getContext({ 
    timeRange: '7d' 
  });
  
  if (result.success) {
    return result.data;
  } else {
    console.error('Failed:', result.error);
    return null;
  }
}
```

## Why Use the SDK Instead?

The SDK wraps the raw API and provides:
- **Graceful fallbacks** when extension isn't installed
- **Automatic permission handling** with better UX
- **Mock data** for development and testing
- **TypeScript support** with full type definitions
- **Analytics** to track adoption and usage
- **Simplified API** that handles all edge cases

## How It Works

1. **Extension injects API** - `window.__squashExtension` available on all pages
2. **Developer installs SDK** - Via npm or CDN
3. **App calls `squash.init()`** - SDK uses injected API to request permission
4. **User sees permission prompt** - One-time decision per domain
5. **SDK wraps all responses** - Normalizes data and handles edge cases

## Target Audience

- Small "chat agent" startups building vertical-specific AI tools
- Developers creating Lovable/Bolt-like applications for specific domains
- Any web app that wants to leverage browsing context for better AI interactions

## Core API

### SDK Setup

```javascript
import squash from 'squash-sdk';

// First, initialize the SDK
await squash.init({
  appName: 'My AI Assistant',     // Required: Your app's name
  appId: 'my-ai-assistant',       // Required: Unique identifier
  installPrompt: true,            // Show install prompt if extension missing
  mockMode: false,                // Use mock data in development
  analytics: true,                // Track usage analytics
  theme: 'auto'                   // UI theme: 'light', 'dark', 'auto'
});
```

### `squash.init(config)`

Initialize the SDK and request permission from the user via the extension.

```javascript
// Must be called before any other methods
const initResult = await squash.init({
  appName: 'My AI Chat',
  appId: 'my-ai-chat'
});

// init() triggers permission prompt if needed
// Returns initialization result
{
  initialized: true,
  extensionInstalled: boolean,
  permissionGranted: boolean,  // User's decision from permission prompt
  version: string,
  isFirstTime: boolean         // True if this was the first permission request
}
```

**Important**: 
- `init()` triggers the extension's permission prompt on first use
- User sees: "[YourApp] wants to access your browsing context"
- If user denies, `permissionGranted` is false and `getContext()` will auto-fail
- Permission decisions are remembered per domain

### `squash.getContext(options?)`

Get browsing context (only works if permission was granted during init):

```javascript
// Only works after successful squash.init() with permission
const result = await squash.getContext({
  relevanceQuery: "project management tools",
  timeRange: "7d",
  maxTokens: 2000
});

// Possible statuses:
if (result.status === 'success') {
  // Use the context
  const { context } = result;
} else if (result.status === 'not_initialized') {
  // Must call squash.init() first
} else if (result.status === 'permission_denied') {
  // User denied permission during init() - auto-fails
} else if (result.status === 'not_installed') {
  // Extension not installed
}
```

**Note**: If user denied permission during `init()`, all `getContext()` calls automatically return `permission_denied` without bothering the user again.

#### Parameters

- `options` (optional): Configuration object
  - `relevanceQuery` (string): Filter context to match specific topics/domains
  - `timeRange` (string): Time window for context ("1h", "24h", "7d", "30d", "all")
  - `maxTokens` (number): Maximum tokens to return (default: 1500)
  - `format` (string): Response format ("raw", "structured", "narrative")

#### Returns

Promise resolving to a result object:

```javascript
{
  status: 'success' | 'not_installed' | 'permission_denied' | 'error',
  context?: {                   // Present when status === 'success'
    summary: string,           // Human-readable summary of browsing patterns
    patterns: [{               // Detected workflow patterns
      name: string,
      description: string,
      frequency: number,
      lastSeen: timestamp
    }],
    topics: [{                 // Key topics/domains of interest
      topic: string,
      relevance: number,       // 0-1 score
      keywords: string[]
    }],
    recentActivities: [{       // Recent relevant activities
      activity: string,
      timestamp: number,
      relevance: number
    }]
  },
  metadata: {
    generatedAt: timestamp,
    version: string,
    tokenCount: number,
    isMockData?: boolean       // True if using mock data
  },
  installUrl?: string          // Chrome Web Store URL when not_installed
}
```

### Additional SDK Methods

```javascript
// Check if extension is installed
const isInstalled = await squash.isExtensionInstalled();

// Show install prompt UI
if (!isInstalled) {
  await squash.showInstallPrompt({
    title: 'Enhance Your AI Experience',
    message: 'Install Squash to give AI assistants context about your work',
    theme: 'light'  // or 'dark', 'auto'
  });
}

// Use mock data for development
squash.enableMockMode();
const mockContext = await squash.getContext(); // Returns realistic mock data

// Analytics helpers
squash.trackEvent('context_used', {
  feature: 'project_management',
  tokenCount: context.metadata.tokenCount
});
```

## Integration Flow

### 1. SDK Installation

```bash
# NPM
npm install squash-sdk

# Yarn
yarn add squash-sdk

# PNPM
pnpm add squash-sdk
```

Or via CDN:
```html
<script src="https://unpkg.com/squash-sdk@latest/dist/squash-sdk.min.js"></script>
```

### 2. Basic Implementation

```javascript
import squash from 'squash-sdk';

// Initialize once when your app starts
const initResult = await squash.init({
  appName: 'My AI Chat',
  appId: 'my-ai-chat',
  installPrompt: true
});

// Check if we have permission
if (!initResult.permissionGranted) {
  console.log('User denied permission to access browsing context');
  // App continues without context features
}

// Use anywhere in your app
async function enhanceUserPrompt(userInput) {
  const result = await squash.getContext();
  
  if (result.status === 'success') {
    // Enhance the prompt with context
    return `
      User context: ${result.context.summary}
      
      User's question: ${userInput}
    `;
  }
  
  // Falls back gracefully if no permission
  return userInput;
}
```

### 3. Handling Different Scenarios

```javascript
import squash from 'squash-sdk';

// Initialize and request permission
const initResult = await squash.init({ 
  appName: 'My App',
  appId: 'my-app'
});

// Check initialization and permission status
if (!initResult.extensionInstalled) {
  console.log('Squash extension not installed');
  // Can show install prompt
} else if (!initResult.permissionGranted) {
  console.log('User denied permission');
  // App works without context
}

// The SDK handles all scenarios gracefully
async function handleAllCases() {
  const result = await squash.getContext();
  
  switch (result.status) {
    case 'success':
      // Perfect! Use the context
      console.log('Got context:', result.context.summary);
      break;
      
    case 'not_initialized':
      // Need to call squash.init() first
      console.log('SDK not initialized');
      break;
      
    case 'not_installed':
      // SDK can show install prompt automatically
      console.log('Install Squash:', result.installUrl);
      break;
      
    case 'permission_denied':
      // User chose not to share context
      console.log('User declined to share context');
      break;
      
    case 'error':
      // Something went wrong
      console.log('Error getting context');
      break;
  }
  
  // App continues to work in all cases
}
```

### 4. Development Mode with Mock Data

```javascript
import squash from 'squash-sdk';

// Enable mock mode for development
await squash.init({ 
  appName: 'My App',
  appId: 'my-app',
  mockMode: process.env.NODE_ENV === 'development'
});

// Always get realistic data, even without extension
const result = await squash.getContext();
// Returns mock data in dev, real data in production

// Manually toggle mock mode after init
squash.enableMockMode();
const mockResult = await squash.getContext(); // Always returns mock data

squash.disableMockMode();
const realResult = await squash.getContext(); // Attempts real data
```

### 5. Advanced Domain-Specific Usage

```javascript
import squash from 'squash-sdk';

// Initialize with app info
await squash.init({ 
  appName: 'PM Assistant',
  appId: 'pm-assistant',
  analytics: true
});

// Domain-specific context retrieval
async function getProjectManagementContext() {
  const result = await squash.getContext({
    relevanceQuery: "project management, agile, scrum, jira, task tracking",
    timeRange: "7d",
    format: "structured"
  });
  
  if (result.status === 'success') {
    // Extract PM-specific insights
    const pmPatterns = result.context.patterns.filter(p => 
      p.name.toLowerCase().includes('project') || 
      p.name.toLowerCase().includes('task')
    );
    
    // Track usage for analytics
    squash.trackEvent('pm_context_used', {
      patternCount: pmPatterns.length
    });
    
    return {
      workStyle: pmPatterns,
      recentProjects: result.context.recentActivities.filter(a => 
        a.relevance > 0.7
      )
    };
  }
  
  // Return mock data in development
  if (result.metadata.isMockData) {
    return {
      workStyle: [{ name: 'Agile Development', frequency: 0.8 }],
      recentProjects: [{ activity: 'Sprint Planning', relevance: 0.9 }]
    };
  }
  
  return null;
}
```

## Privacy & Security

### User Consent Flow

1. **Permission Request During Init**: When a website calls `squash.init()` for the first time, the extension shows a permission dialog:
   ```
   "example.com wants to access your browsing context"
   [Allow] [Deny]
   ```

2. **One-Time Decision**: 
   - Permission is requested only during `init()`, never on `getContext()`
   - User's choice is remembered permanently for this domain
   - Future visits skip the permission prompt

3. **SDK Handles Permission State**:
   ```javascript
   // During initialization
   const initResult = await squash.init({ appName: 'My App', appId: 'my-app' });
   
   if (initResult.permissionGranted) {
     // Great! Can use getContext() freely
   } else {
     // User denied - getContext() will auto-fail
     // Design your app to work without context
   }
   ```

### Data Handling

- **No Storage**: The SDK never stores user data - it only acts as a conduit
- **Read-Only**: The SDK cannot modify or delete any browsing data
- **Filtered Data**: The extension pre-filters sensitive information (passwords, payment info, etc.)
- **Domain Whitelist**: Only whitelisted domains can access context (user-controlled)

### Security Measures

```javascript
// Built-in security features
squash.getContext({
  // These are enforced by the extension, not the website
  excludePatterns: ['banking', 'medical', 'private'],
  sanitize: true  // Remove PII
});
```

## Implementation Architecture

### Extension → Page Communication

1. **Extension injects script** into every webpage that creates `window.__squashExtension`
2. **Injected API provides**:
   - `requestPermission()` - Request access to browsing context
   - `getContext()` - Retrieve analyzed browsing data
   - `isPermissionGranted()` - Check permission status
3. **Extension handles**:
   - Permission UI and user decisions
   - Domain whitelisting
   - Context preparation and filtering

### SDK → Extension Communication Flow

1. **SDK calls `squash.init()`**
2. **SDK checks if `window.__squashExtension` exists**
3. **If exists, SDK calls** `window.__squashExtension.requestPermission({ appName, appId })`
4. **Extension shows permission prompt** (first time only)
5. **User decides**:
   - **Allow**: Extension saves permission and returns `{ granted: true }`
   - **Deny**: Extension saves rejection and returns `{ granted: false }`
6. **SDK wraps the response** in a normalized format

7. **Later, SDK calls `squash.getContext()`**:
   - SDK first checks `window.__squashExtension.isPermissionGranted()`
   - If true → Calls `window.__squashExtension.getContext(options)`
   - If false → Returns auto-fail without calling extension

### For SDK Implementation

1. **Detect Extension**: Check for `window.__squashExtension` object
2. **Handle Permission Flow**: First call triggers extension's permission UI
3. **Normalize Responses**: Convert extension responses to consistent format
4. **Provide Fallbacks**: Mock data, install prompts, graceful degradation
5. **TypeScript Support**: Full type definitions for all methods

### For Squash Extension

1. **Content Script Injection**: Inject `__squashExtension` object into all pages
2. **Permission UI**: Show permission prompt on first `getContext` call per domain
3. **Domain Whitelist**: Store user decisions (allow/deny) per domain
4. **Message Handling**: Listen for SDK requests and validate origin
5. **Context Preparation**: Only send context to approved domains
6. **Security**: Validate all requests, sanitize data, respect user preferences

## SDK Architecture & Performance

- **Tiny Bundle**: <10KB minified + gzipped
- **Zero Dependencies**: Pure JavaScript, works everywhere
- **TypeScript Support**: Full type definitions included
- **Async/Promise Based**: Non-blocking API
- **Smart Caching**: SDK caches results to reduce extension calls
- **Graceful Degradation**: Works without extension via mock data

## Example Use Cases

### 1. Project Management Assistant
```javascript
// Bolt-like PM tool instantly knows user's project context
const context = await squash.getContext({
  relevanceQuery: "github, gitlab, jira, linear",
  format: "narrative"
});

// AI now knows: "User frequently works on React projects, 
// uses GitHub issues, prefers kanban boards..."
```

### 2. Code Assistant
```javascript
// Lovable-like coding assistant understands tech stack
const context = await squash.getContext({
  relevanceQuery: "programming, npm, github, stack overflow",
  timeRange: "24h"
});

// AI now knows: "User has been debugging TypeScript errors,
// working with Next.js, researching React hooks..."
```

### 3. Shopping Assistant
```javascript
// E-commerce helper knows shopping preferences
const context = await squash.getContext({
  relevanceQuery: "shopping, amazon, reviews, products",
  maxTokens: 1000
});

// AI now knows: "User researches extensively before buying,
// prefers sustainable products, budget-conscious..."
```

## Future Enhancements

1. **Streaming Context**: Real-time context updates via WebSocket
2. **Context Subscriptions**: Subscribe to specific pattern changes
3. **Developer Analytics**: Usage metrics and insights
4. **Context Marketplace**: Pre-built context templates for common use cases
5. **Multi-Extension Support**: Aggregate context from multiple browser extensions

## Getting Started

1. **For Developers**: 
   - Check if `window.squash` exists
   - Call `squash.getContext()` when you need context
   - Handle both success and failure cases gracefully
   - No SDK installation required!

2. **For Users**:
   - Install the Squash browser extension
   - Visit any website that uses Squash
   - Grant permission when prompted (one-time per site)
   - Enjoy smarter AI interactions

## Minimal Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>My AI App</title>
  <script src="https://unpkg.com/squash-sdk@latest/dist/squash-sdk.min.js"></script>
</head>
<body>
  <script>
    // Initialize SDK
    squash.init({ 
      appName: 'My AI App',
      appId: 'my-ai-app'
    }).then(() => {
      console.log('Squash SDK ready!');
    });
    
    // Enhance prompts with context
    async function enhancePrompt(userInput) {
      const result = await squash.getContext();
      if (result.status === 'success') {
        return `Context: ${result.context.summary}\n\nUser: ${userInput}`;
      }
      return userInput;
    }
  </script>
</body>
</html>
```

## Support

- GitHub Issues: [github.com/squash/sdk/issues](https://github.com/squash/sdk/issues)
- Documentation: [docs.squash.dev](https://docs.squash.dev)
- Discord Community: [discord.gg/squash](https://discord.gg/squash)