# Context Selection Button Specification

## Overview

A browser extension feature that adds a context selection button to chat interfaces, providing intelligent context suggestions from the user's stored memory/profile as they type. Initially implemented for ChatGPT.com with architecture designed for adaptability to other chat platforms.

## Button Placement

### ChatGPT.com Implementation

**Target Locations** (varies by model/interface):
- **Primary**: Composer footer actions: `[data-testid="composer-footer-actions"]`
- **Alternative**: Inside composer actions wrapper when layout differs
- **Position**: Before existing "Attach", "Search", or "Tools" buttons
- **CSS Classes**: `composer-btn` or match existing button styling

**Adaptive Selectors** (handles different ChatGPT layouts):
```javascript
const composerSelectors = [
  '[data-testid="composer-footer-actions"]',
  '.flex.items-center[style*="margin-inline-end"]', // Alternative layout
  '.absolute.end-2\\.5.bottom-0.flex.items-center' // Fallback
];
```

### Generalization for Other Platforms

**Common Patterns**:
- Look for chat input containers with action buttons
- Target areas near file upload, emoji, or send buttons
- Adapt styling to match platform's design system
- Use CSS-in-JS for dynamic styling adaptation

## Context Retrieval & Semantic Lookup

Leveraging the existing memory system:

### Data Sources (`UserProfile` from memory.ts)

- **Current Goals**: Immediate objectives and projects
- **Recent Obsessions**: Active interests and focus areas  
- **Professional Context**: Work patterns, profession, technology use
- **Personal Preferences**: Communication style, preferred tools
- **Personality Traits**: Behavioral patterns with evidence
- **Workflow Patterns**: Repetitive tasks and automation opportunities

### Semantic Matching Algorithm

**Hybrid Approach** combining traditional and modern techniques:

#### Primary: Semantic Embeddings (Best Practice 2024)
- **Library**: Transformers.js with lightweight embedding models
- **Model**: `Xenova/gte-small` (~70MB) - Best performance/size ratio for English in 2024
- **Dimensions**: 384 (efficient for cosine similarity)
- **Process**: 
  1. **Pre-compute**: Generate embeddings for context during memory save
  2. **Real-time**: Generate embeddings for user input (fast inference)
  3. **Match**: Compare using cosine similarity, return top 5 matches above threshold (0.4)

#### Fallback: Traditional String Matching
- **Library**: `string-similarity` (Dice's Coefficient)
- **Use Cases**: When semantic model loading fails or for exact keyword matches
- **Process**: Direct string similarity against context snippets

#### Optimization Strategy
1. **Pre-computed Embeddings**: Generate context embeddings during memory save
2. **Debounced Analysis**: Process input after 300ms pause to avoid excessive computation
3. **Caching**: Store recent similarity results for common phrases
4. **Progressive Enhancement**: Start with string similarity, upgrade to semantic when model loads

### Embedding Computation on Memory Save

**Extended Memory Structure**:
```typescript
interface AnalysisMemoryWithEmbeddings extends AnalysisMemory {
  contextEmbeddings?: {
    [contextId: string]: {
      text: string;
      embedding: Float32Array; // 384 dimensions for gte-small
      category: 'goals' | 'profession' | 'patterns' | 'preferences';
      lastUpdated: Date;
    }
  };
  embeddingModelVersion?: string; // Track model changes
}
```

**Implementation**:
```typescript
// Enhanced saveMemory function
async function saveMemoryWithEmbeddings(memory: AnalysisMemory): Promise<void> {
  const memoryWithEmbeddings = await computeContextEmbeddings(memory);
  await saveMemory(memoryWithEmbeddings);
}

// Compute embeddings for all context snippets
async function computeContextEmbeddings(memory: AnalysisMemory): Promise<AnalysisMemoryWithEmbeddings> {
  const { pipeline } = await import('@xenova/transformers');
  const extractor = await pipeline('feature-extraction', 'Xenova/gte-small');
  
  const embeddings = {};
  
  // Extract all context text from UserProfile
  const contexts = [
    ...memory.userProfile.currentGoals.map(goal => ({ text: goal, category: 'goals' })),
    ...memory.userProfile.recentObsessions.map(obs => ({ text: obs, category: 'goals' })),
    { text: memory.userProfile.profession, category: 'profession' },
    ...memory.userProfile.personalPreferences.map(pref => ({ 
      text: `${pref.category}: ${pref.preference}`, 
      category: 'preferences' 
    })),
    ...memory.patterns.map(pattern => ({ 
      text: `${pattern.pattern}: ${pattern.description}`, 
      category: 'patterns' 
    }))
  ].filter(ctx => ctx.text && ctx.text.trim().length > 0);

  // Batch process for efficiency
  const texts = contexts.map(ctx => ctx.text);
  const batchEmbeddings = await extractor(texts, { pooling: 'mean', normalize: true });

  // Store with unique IDs
  contexts.forEach((context, index) => {
    const contextId = `${context.category}_${hashString(context.text)}`;
    embeddings[contextId] = {
      text: context.text,
      embedding: batchEmbeddings[index].data, // Float32Array
      category: context.category,
      lastUpdated: new Date()
    };
  });

  return {
    ...memory,
    contextEmbeddings: embeddings,
    embeddingModelVersion: 'Xenova/gte-small'
  };
}

// Simple hash function for context IDs
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}
```

**Performance Considerations**:
- **Batch Processing**: Compute all embeddings in a single model call
- **Incremental Updates**: Only recompute embeddings for changed contexts
- **Lazy Loading**: Model loads only when first needed
- **Storage Efficiency**: Store embeddings in IndexedDB for persistence

## UI/UX Design

### Button States

- **Default**: Context icon with subtle glow when relevant context available
- **Active**: Highlighted when context suggestions are ready
- **Loading**: Spinner while processing context

### Context Suggestion Interface

- **Dropdown Panel**: Appears below the button when clicked
- **Suggestion Cards**: Each showing:
  - Context snippet (1-2 sentences)
  - Source category (goals, profession, patterns, etc.)
  - Relevance indicator
- **Quick Insert**: Click to append context to input
- **Smart Positioning**: Adjust panel position based on screen space

## Implementation Architecture

### Platform-Agnostic Content Script Integration

```javascript
// Adaptive element detection for different platforms
class PlatformAdapter {
  static detectPlatform() {
    if (window.location.hostname.includes('chatgpt.com')) return 'chatgpt';
    if (window.location.hostname.includes('claude.ai')) return 'claude';
    // Add more platforms as needed
    return 'generic';
  }

  static getSelectors(platform) {
    const configs = {
      chatgpt: {
        composerActions: [
          '[data-testid="composer-footer-actions"]',
          '.flex.items-center[style*="margin-inline-end"]',
          '.absolute.end-2\\.5.bottom-0.flex.items-center'
        ],
        chatInput: ['#prompt-textarea', '[contenteditable="true"]'],
        buttonClass: 'composer-btn'
      },
      generic: {
        composerActions: ['[class*="composer"]', '[class*="input-actions"]'],
        chatInput: ['textarea', '[contenteditable="true"]'],
        buttonClass: 'context-btn'
      }
    };
    return configs[platform] || configs.generic;
  }
}

// Dynamic button creation with platform-specific styling
function createContextButton(platform) {
  const config = PlatformAdapter.getSelectors(platform);
  const button = document.createElement('button');
  
  // Apply platform-specific styling
  if (platform === 'chatgpt') {
    button.className = 'composer-btn';
    button.setAttribute('aria-label', 'Add context from memory');
  } else {
    button.className = 'context-btn';
  }
  
  button.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
      <!-- Brain/context icon -->
    </svg>
    <span class="context-label">Context</span>
  `;
  
  return button;
}
```

### Context Processing Flow

1. **Input Monitoring**: Listen for `input` events on chat textarea
2. **Debounced Analysis**: Process input after 300ms pause
3. **Memory Lookup**: Query stored UserProfile using semantic matching
4. **Suggestion Generation**: Create ranked list of relevant context
5. **UI Update**: Show/hide button active state and suggestion count

### Integration with Existing Memory System

- Use existing `loadMemory()` function from `memory.ts`
- Leverage `UserProfile` structure for context data
- Implement new semantic search utilities in `utils/` directory

## Technical Requirements

### New Files Needed

- `src/lib/ContextSelector.svelte` - Main context selection component
- `src/utils/semantic-matcher.ts` - Hybrid semantic/string matching with Transformers.js
- `src/utils/platform-adapter.ts` - Platform detection and DOM injection logic
- `src/utils/embeddings-cache.ts` - Embeddings storage and similarity search
- `content-scripts/universal-context.ts` - Universal content script for all platforms
- `content-scripts/platforms/chatgpt.ts` - ChatGPT-specific integration
- `manifest-updates.json` - Content script registration for multiple domains

### Dependencies

- **Core**: Existing memory system (`memory.ts`, `types.ts`)
- **Semantic**: `@xenova/transformers` (~2MB runtime + ~70MB gte-small model)
- **Fallback**: `string-similarity` (~5KB) for traditional matching
- **Storage**: Chrome storage API (already available)
- **Utils**: DOM manipulation utilities

### Permissions & Manifest Updates

**Existing** (already available):
- `activeTab` for content script injection
- `storage` for memory access

**New Requirements**:
- Add content script registration for multiple domains in `manifest.json`:
```json
{
  "content_scripts": [
    {
      "matches": ["https://chatgpt.com/*", "https://claude.ai/*"],
      "js": ["content-scripts/universal-context.js"],
      "run_at": "document_end"
    }
  ]
}
```

## User Experience Flow

1. **Setup**: Extension automatically injects context button when user visits supported chat platforms
2. **Typing**: As user types, system analyzes input for context relevance
3. **Suggestion**: Button shows active state when relevant context is found
4. **Selection**: User clicks button to see context suggestions
5. **Insertion**: User clicks suggested context to append to their message
6. **Learning**: System tracks which contexts are used to improve future suggestions

## Privacy & Performance

### Privacy

- All processing happens locally using existing memory system
- No external API calls for context matching
- User's context data never leaves the browser

### Performance

- **Model Loading**: Xenova/gte-small (70MB) loaded on-demand and cached in browser
- **Input Processing**: Debounced analysis (300ms) to avoid excessive computation
- **Embeddings**: Pre-computed context embeddings stored locally
- **Search**: Cosine similarity search using efficient vector operations
- **Fallback**: Instant string similarity when semantic model unavailable
- **UI**: Maximum 5 suggestions, lazy loading of context details

## Implementation Priority

1. **Phase 1**: Basic button injection and styling
2. **Phase 2**: Semantic matching and context retrieval
3. **Phase 3**: Context suggestion UI and insertion
4. **Phase 4**: Learning and optimization features