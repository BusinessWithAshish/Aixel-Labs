# Generic Stream Messages System

## Overview

This module provides a type-safe, generic streaming response system for Server-Sent Events (SSE) that can be used across different APIs and scraping operations.

## Key Features

- **Type-safe**: Fully typed with TypeScript generics
- **Extensible**: Supports custom event types and metadata
- **Reusable**: Works for single or multiple browser operations
- **Clean API**: Simple, intuitive functions for creating and sending messages
- **Auto-timestamping**: Automatically adds timestamps to all messages
- **Console logging**: Optional console output for debugging

## Core Types

### Base Event Types

```typescript
type BaseStreamEventType = 
  | 'status'      // General status updates
  | 'progress'    // Progress updates with percentage
  | 'error'       // Error notifications
  | 'complete'    // Operation completion
  | 'warning';    // Warning messages
```

### Stream Message Structure

```typescript
type StreamMessage<TEventType, TMetadata> = {
  type: TEventType;
  message: string;
  data?: BaseStreamMetadata & TMetadata;
}
```

## Usage Examples

### Example 1: Basic Usage (Browser Batch Handler)

```typescript
import { 
  createStreamSender, 
  createStreamMessage,
  BrowserStreamEventType,
  BrowserStreamMetadata 
} from "../utils/stream-messages";

// Create a stream sender
const streamSender = createStreamSender<BrowserStreamEventType, BrowserStreamMetadata>(res);

// Send messages
streamSender(createStreamMessage(
  'browser_start',
  'Starting browser 1 to process 10 items',
  { browser: 1, batch: 1 }
));
```

### Example 2: Custom API-Specific Types

```typescript
import { 
  createStreamSender, 
  createStreamMessage,
  BaseStreamEventType 
} from "../utils/stream-messages";

// Define custom event types
type GmapsStreamEventType = BaseStreamEventType | 'phase_start' | 'phase_complete';

// Define custom metadata
type GmapsStreamMetadata = { 
  phase?: number; 
  foundedLeadsCount?: number; 
  allLeadsCount?: number; 
};

// Create typed stream sender
const streamSender = createStreamSender<GmapsStreamEventType, GmapsStreamMetadata>(res);

// Send custom messages
streamSender(createStreamMessage(
  'phase_start',
  'Phase 1: Searching for business listings...',
  { phase: 1, stage: 'phase_1_start' }
));
```

### Example 3: Single Page Scraping

```typescript
// For simple single-page scraping
type SimpleStreamEventType = BaseStreamEventType | 'data_found' | 'parsing';
type SimpleStreamMetadata = { itemCount?: number; };

const streamSender = createStreamSender<SimpleStreamEventType, SimpleStreamMetadata>(res);

streamSender(createStreamMessage('data_found', 'Found 25 items', { itemCount: 25 }));
```

## Predefined Browser Types

For browser-based scraping operations, predefined types are available:

```typescript
type BrowserStreamEventType = 
  | BaseStreamEventType
  | 'browser_start'
  | 'browser_complete'
  | 'browser_cleanup'
  | 'page_start'
  | 'page_complete'
  | 'page_error'
  | 'batch_start'
  | 'batch_complete'
  | 'batch_delay';

type BrowserStreamMetadata = {
  browser?: number;
  batch?: number;
  page?: number;
  url?: string;
};
```

## Helper Functions

### `initializeSSEResponse(res: Response)`

Sets up proper SSE headers for streaming response.

```typescript
initializeSSEResponse(res);
```

### `createStreamSender(res, options?)`

Creates a stream sender function with optional configuration.

**Options:**
- `enableConsoleLog`: Enable/disable console logging (default: true)
- `logPrefix`: Console log prefix (default: '📡')
- `autoTimestamp`: Auto-add timestamps (default: true)

```typescript
const streamSender = createStreamSender<EventType, MetadataType>(res, {
  enableConsoleLog: true,
  logPrefix: '🚀',
  autoTimestamp: true
});
```

### `createStreamMessage(type, message, data?)`

Creates a properly typed stream message with automatic timestamp.

```typescript
const message = createStreamMessage(
  'status',
  'Processing started',
  { current: 1, total: 100, percentage: 1 }
);
```

## Migration Guide

### Before (Old Approach)

```typescript
res.write(`data: ${JSON.stringify({
  type: 'status',
  message: 'Starting processing',
  data: { total: 100 },
  timestamp: new Date().toISOString()
})}\n\n`);
```

### After (New Approach)

```typescript
const streamSender = createStreamSender(res);
streamSender(createStreamMessage(
  'status',
  'Starting processing',
  { total: 100 }
));
```

## Benefits

1. **Type Safety**: Catch errors at compile time with full TypeScript support
2. **Consistency**: Uniform message format across all APIs
3. **Maintainability**: Changes to streaming logic in one place
4. **Extensibility**: Easy to add new event types without changing core logic
5. **Testability**: Can pass null response for testing without streaming
6. **DRY Principle**: No repetitive JSON.stringify and timestamp code

## Best Practices

1. Define custom event types specific to your API
2. Create meaningful metadata types for your use case
3. Use the predefined browser types for scraping operations
4. Always initialize SSE headers before sending messages
5. Use descriptive event type names (e.g., 'phase_start' instead of 'custom1')
6. Keep metadata flat and simple for easy consumption on the client
