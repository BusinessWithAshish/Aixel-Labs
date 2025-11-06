# Stream Messages - Quick Reference

## Basic Setup

```typescript
import { 
  initializeSSEResponse,
  createStreamSender, 
  createStreamMessage 
} from "../utils/stream-messages";

// 1. Initialize SSE headers
initializeSSEResponse(res);

// 2. Create stream sender
const streamSender = createStreamSender(res);

// 3. Send messages
streamSender(createStreamMessage('status', 'Processing started'));
```

## With Custom Types

```typescript
import { BaseStreamEventType } from "../utils/stream-messages";

// Define custom event types
type MyEventType = BaseStreamEventType | 'custom_event';
type MyMetadata = { customField?: string };

// Create typed sender
const streamSender = createStreamSender<MyEventType, MyMetadata>(res);

// Send typed messages
streamSender(createStreamMessage(
  'custom_event',
  'Custom message',
  { customField: 'value' }
));
```

## Browser Operations (Predefined)

```typescript
import { 
  BrowserStreamEventType,
  BrowserStreamMetadata,
  createStreamSender,
  createStreamMessage
} from "../utils/stream-messages";

const streamSender = createStreamSender<
  BrowserStreamEventType,
  BrowserStreamMetadata
>(res);

streamSender(createStreamMessage(
  'browser_start',
  'Starting browser 1',
  { browser: 1, batch: 1 }
));
```

## Base Event Types

- `'status'` - General status updates
- `'progress'` - Progress with percentage
- `'error'` - Error notifications
- `'complete'` - Operation completion
- `'warning'` - Warning messages

## Browser Event Types

- `'browser_start'`, `'browser_complete'`, `'browser_cleanup'`
- `'page_start'`, `'page_complete'`, `'page_error'`
- `'batch_start'`, `'batch_complete'`, `'batch_delay'`

## Common Metadata Fields

```typescript
{
  current?: number;       // Current item number
  total?: number;         // Total items
  percentage?: number;    // Progress percentage
  stage?: string;         // Stage identifier
  browser?: number;       // Browser index
  batch?: number;         // Batch number
  page?: number;          // Page number
  url?: string;           // Current URL
  timestamp: string;      // Auto-added timestamp
}
```

## Options

```typescript
createStreamSender(res, {
  enableConsoleLog: true,   // Enable/disable logging
  logPrefix: '📡',          // Console log prefix
  autoTimestamp: true       // Auto-add timestamps
});
```

## Testing Without HTTP Response

```typescript
// Pass null to disable streaming but keep logging
const streamSender = createStreamSender(null, {
  enableConsoleLog: true
});
```

## Frontend Types (shared-types)

```typescript
import { 
  StreamMessage, 
  BrowserStreamMessage,
  BaseStreamEventType 
} from "@aixellabs/shared-types";
```

## Common Patterns

### Progress Updates
```typescript
streamSender(createStreamMessage(
  'progress',
  'Processing item 5 of 10',
  { current: 5, total: 10, percentage: 50 }
));
```

### Error Handling
```typescript
streamSender(createStreamMessage(
  'error',
  'Failed to process item',
  { stage: 'processing' }
));
```

### Completion
```typescript
streamSender(createStreamMessage(
  'complete',
  'All items processed',
  { total: 100, percentage: 100 }
));
```

## Files

- **Core**: `src/utils/stream-messages.ts`
- **Docs**: `src/utils/STREAM_MESSAGES_README.md`
- **Examples**: `src/utils/STREAM_MESSAGES_EXAMPLES.ts`
- **Shared Types**: `packages/shared-types/index.ts`
