# Squash SDK

Official JavaScript/TypeScript SDK for integrating with the Squash browser extension. Enable your AI-powered applications to access rich browsing context with a single function call.

## Installation

```bash
npm install squash-sdk
# or
yarn add squash-sdk
# or
pnpm add squash-sdk
```

## Quick Start

```javascript
import squash from 'squash-sdk';

// Initialize the SDK
await squash.init({
  appName: 'My AI Assistant',
  appId: 'my-ai-assistant'
});

// Get browsing context
const result = await squash.getContext();

if (result.status === 'success') {
  console.log('User context:', result.context.summary);
}
```

## Features

- 🚀 **Simple Integration** - Just two function calls to get started
- 🔒 **Privacy-First** - Users control their data with granular permissions
- 🎭 **Mock Mode** - Built-in mock data for development
- 📦 **TypeScript Support** - Full type definitions included
- 🎨 **UI Components** - Beautiful install prompts and permission dialogs
- 📊 **Analytics Ready** - Track usage and adoption

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
  title: 'Enhance Your Experience',
  message: 'Install Squash for smarter AI interactions',
  theme: 'dark'
});

// Enable mock mode for development
squash.enableMockMode();

// Track custom events
squash.trackEvent('feature_used', { feature: 'context_enhancement' });
```

## Examples

### Basic Integration

```javascript
import squash from 'squash-sdk';

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
import squash from 'squash-sdk';

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

## Browser Support

- Chrome 90+ (requires Squash extension)
- Edge 90+ (requires Squash extension)
- Other browsers: Returns mock data or shows install prompt

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

## Privacy & Security

- All data access is controlled by the Squash extension
- Users must explicitly grant permission per domain
- No data is stored by the SDK
- Context is filtered to remove sensitive information

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- Issues: [GitHub Issues](https://github.com/squash/squash-sdk/issues)
- Discord: [Join our community](https://discord.gg/squash)
- Email: sdk@squash.dev