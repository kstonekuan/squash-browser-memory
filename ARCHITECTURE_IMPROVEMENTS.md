# Architecture Improvements for tRPC Migration

## Current State ✅
- Complete tRPC migration from @webext-core/messaging
- Type-safe communication with Zod schemas
- Clean separation of concerns
- Full feature parity with main branch

## Proposed Improvements

### 1. **Unified Router Architecture**
**Current**: Separate `appRouter` and `offscreenRouter`
**Proposed**: Single unified router with nested namespaces

```typescript
// src/trpc/router.ts - Unified approach
const appRouter = t.router({
  // Background procedures
  analysis: t.router({
    startManual: t.procedure...,
    cancel: t.procedure...,
    getState: t.procedure...
  }),
  
  settings: t.router({
    toggleAutoAnalysis: t.procedure...,
    queryNextAlarm: t.procedure...
  }),
  
  memory: t.router({
    read: t.procedure...,
    write: t.procedure...,
    clearPatterns: t.procedure...
  }),
  
  // Offscreen procedures
  offscreen: t.router({
    startAnalysis: t.procedure...,
    cancelAnalysis: t.procedure...,
    initializeAI: t.procedure...
  }),
  
  // Internal procedures (for cross-context communication)
  _internal: t.router({
    reportProgress: t.procedure...,
    reportComplete: t.procedure...,
    reportError: t.procedure...,
    keepalive: t.procedure...
  })
});
```

**Benefits**:
- Single source of truth for all procedures
- Cleaner client imports
- Better organization by feature
- Easier to maintain and extend

### 2. **Improved File Organization** ✅ (Already done)
**Moved**: `src/utils/trpc-chrome.ts` → `src/trpc/chrome-adapter.ts`
**Benefits**:
- Logical grouping of tRPC-related code
- Better discoverability
- Cleaner imports

### 3. **Enhanced Type Safety**
**Current**: Basic Zod schemas
**Proposed**: Stricter typing with branded types

```typescript
// src/trpc/types.ts - Brand types for safety
export type AnalysisId = string & { __brand: 'AnalysisId' };
export type PortName = string & { __brand: 'PortName' };

// More specific schemas
export const analysisIdSchema = z.string().brand<AnalysisId>();
export const portNameSchema = z.string().brand<PortName>();
```

### 4. **Better Error Handling**
**Current**: Basic error throwing
**Proposed**: Structured error system

```typescript
// src/trpc/errors.ts - Structured errors
export class AnalysisError extends Error {
  constructor(
    message: string,
    public code: 'ALREADY_RUNNING' | 'AI_UNAVAILABLE' | 'CANCELLED',
    public analysisId?: string
  ) {
    super(message);
  }
}

// Usage in procedures
.mutation(async ({ input }) => {
  if (isAnalysisRunning) {
    throw new AnalysisError(
      'Analysis already in progress',
      'ALREADY_RUNNING',
      currentAnalysisId
    );
  }
  // ...
})
```

### 5. **Middleware System**
**Proposed**: Add middleware for common concerns

```typescript
// src/trpc/middleware.ts - Common middleware
const authMiddleware = t.middleware(async ({ next, ctx }) => {
  // Add authentication checks if needed
  return next({ ctx });
});

const loggingMiddleware = t.middleware(async ({ next, path, type }) => {
  const start = Date.now();
  const result = await next();
  console.log(`${type} ${path} - ${Date.now() - start}ms`);
  return result;
});

// Usage
const protectedProcedure = t.procedure.use(authMiddleware);
const loggedProcedure = t.procedure.use(loggingMiddleware);
```

### 6. **Connection Management**
**Current**: Basic port management
**Proposed**: Smart connection pooling

```typescript
// src/trpc/connection-manager.ts - Smart connections
export class ConnectionManager {
  private connections = new Map<string, chrome.runtime.Port>();
  
  getConnection(portName: string): chrome.runtime.Port {
    if (!this.connections.has(portName)) {
      const port = chrome.runtime.connect({ name: portName });
      this.connections.set(portName, port);
      
      port.onDisconnect.addListener(() => {
        this.connections.delete(portName);
      });
    }
    
    return this.connections.get(portName)!;
  }
}
```

### 7. **Request/Response Caching**
**Proposed**: Smart caching for expensive operations

```typescript
// src/trpc/cache.ts - Request caching
const cache = new Map<string, { data: any, timestamp: number }>();

const cachedProcedure = t.procedure.use(async ({ next, path, input }) => {
  const cacheKey = `${path}:${JSON.stringify(input)}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < 5000) {
    return cached.data;
  }
  
  const result = await next();
  cache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
});
```

### 8. **Enhanced Observability**
**Proposed**: Better monitoring and debugging

```typescript
// src/trpc/observability.ts - Monitoring
export const metricsMiddleware = t.middleware(async ({ next, path, type }) => {
  const start = performance.now();
  
  try {
    const result = await next();
    
    // Track successful operations
    console.log(`✅ ${type} ${path}:`, {
      duration: performance.now() - start,
      success: true
    });
    
    return result;
  } catch (error) {
    // Track failed operations
    console.error(`❌ ${type} ${path}:`, {
      duration: performance.now() - start,
      error: error.message,
      success: false
    });
    
    throw error;
  }
});
```

### 9. **Schema Validation Improvements**
**Proposed**: Runtime schema validation with better error messages

```typescript
// src/trpc/validation.ts - Enhanced validation
export const createValidatedProcedure = <T>(schema: z.ZodSchema<T>) => {
  return t.procedure.input(schema).use(async ({ next, input }) => {
    try {
      const validated = schema.parse(input);
      return next({ input: validated });
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Validation failed: ${error.issues.map(i => i.message).join(', ')}`);
      }
      throw error;
    }
  });
};
```

### 10. **Performance Optimizations**
**Proposed**: Lazy loading and code splitting

```typescript
// src/trpc/lazy-procedures.ts - Lazy loading
const lazyProcedure = (importPath: string, handlerName: string) => {
  return t.procedure.mutation(async ({ input }) => {
    const module = await import(importPath);
    return module[handlerName](input);
  });
};

// Usage
const router = t.router({
  analysis: t.router({
    startManual: lazyProcedure('../background-handlers', 'handleStartManualAnalysis'),
    // This way handlers are only loaded when needed
  })
});
```

## Implementation Priority

1. **High Priority**: Unified router architecture
2. **Medium Priority**: Enhanced error handling, better observability
3. **Low Priority**: Caching, performance optimizations
4. **Future**: Advanced middleware, connection pooling

## Benefits Summary

- **Better Developer Experience**: Cleaner code, better types, easier debugging
- **Enhanced Reliability**: Structured errors, better connection management
- **Improved Performance**: Caching, lazy loading, smart connections
- **Better Maintainability**: Unified architecture, clear separation of concerns
- **Enhanced Observability**: Better logging, metrics, debugging capabilities