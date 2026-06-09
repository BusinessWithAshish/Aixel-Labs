# AI SDK UI Hooks

## `useChat` Hook (React)

Core hook for chat interfaces. Import from `@ai-sdk/react`.

```tsx
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const {
  messages,      // UIMessage[]
  sendMessage,   // (message, options?) => void
  status,        // 'submitted'|'streaming'|'ready'|'error'
  stop,          // () => void
  regenerate,    // () => void
  setMessages,   // (msgs) => void
  error,         // Error | undefined
} = useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
  onFinish: ({ message, messages, isAbort, isDisconnect, isError }) => {},
  onError: (error) => {},
  onData: (data) => {},
  experimental_throttle: 50, // ms, React only
});
```

**Sending messages:**

```tsx
sendMessage({ text: 'Hello', files: fileList }); // basic
sendMessage({ text: input }, { headers: {...}, body: { customKey: 'val' }, metadata: {...} }); // with options
```

**Status states:**

- `submitted`: sent, awaiting stream start
- `streaming`: receiving chunks
- `ready`: complete, ready for new message
- `error`: request failed

**Message structure:**

```ts
message.id, message.role, message.parts[], message.metadata
// parts: { type:'text', text }, { type:'reasoning', text }, { type:'source-url', url, title },
//        { type:'source-document' }, { type:'file', url, mediaType, filename }
//        { type:'tool-{toolName}', state, input, output, preliminary }
```

Render parts, not `content`. Use `part.type === 'text'` etc.

**Transport options:**

- `DefaultChatTransport({ api, headers, body, credentials, prepareSendMessagesRequest })` — standard HTTP
- `TextStreamChatTransport({ api })` — plain text stream (no tool calls, usage)
- `DirectChatTransport({ agent })` — direct agent, no HTTP

**Request customization:**

```tsx
// Hook-level (all requests):
transport: new DefaultChatTransport({ api: '/api/chat', headers: { Authorization: 'Bearer ...' }, body: { userId: '123' } })
// Dynamic:
headers: () => ({ Authorization: `Bearer ${getToken()}` })
// Request-level (recommended, higher priority):
sendMessage({ text: input }, { headers: {...}, body: {...} })
```

**Controlling response stream:**

```ts
// Error messages (server):
result.toUIMessageStreamResponse({ onError: error => error.message });
// Usage info (server):
result.toUIMessageStreamResponse({ messageMetadata: ({ part }) => {
  if (part.type === 'finish') return { totalUsage: part.totalUsage };
}});
// Reasoning (server):
result.toUIMessageStreamResponse({ sendReasoning: true });
// Sources (server):
result.toUIMessageStreamResponse({ sendSources: true });
```

**Type inference for tools:**

```ts
import { InferUITool, InferUITools, UIMessage, UIDataTypes } from 'ai';
type MyUITools = InferUITools<typeof tools>;
type MyUIMessage = UIMessage<MyMetadata, UIDataTypes, MyUITools>;
const { messages } = useChat<MyUIMessage>();
```

## Chatbot Message Persistence

Store and restore conversation history.

**Loading existing messages:**

```tsx
const { messages } = useChat({
  initialMessages: await loadMessages(chatId), // UIMessage[]
});
```

**Saving on finish:**

```ts
// Server-side via onFinish in streamText:
onFinish: async ({ response }) => {
  await saveMessages(chatId, response.messages);
}
// Or client-side via useChat onFinish callback
```

**Custom transport with message loading:**

```tsx
transport: new DefaultChatTransport({
  prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => ({
    body: { id, trigger, message: messages[messages.length - 1], messageId }
  })
})
```

## Chatbot Resume Streams

Resume interrupted streams using stream IDs.

**Server**: Generate and store stream, return stream ID:

```ts
const result = streamText({ model, messages });
const { consumeStream } = createResumableStreamContext({ waitUntil: c.executionCtx.waitUntil });
const streamId = generateId();
await saveStreamId(chatId, streamId);
return result.toUIMessageStreamResponse({ consumeStream, getStreamContext: () => resumableStreamContext });
```

**Client**: Resume on mount:

```tsx
const { messages, experimental_resume } = useChat({ id: chatId });
useEffect(() => { experimental_resume(); }, []);
```

## Chatbot Tool Usage (UI)

Tool invocations appear as `tool-{name}` parts in messages.

**Rendering:**

```tsx
{message.parts.map((part, i) => {
  switch(part.type) {
    case 'text': return <div key={i}>{part.text}</div>;
    case 'tool-weather':
      if (part.state === 'input-streaming') return <div key={i}>Calling weather...</div>;
      if (part.state === 'output-available') return <div key={i}>Temp: {part.output.temperature}</div>;
      if (part.state === 'output-error') return <div key={i}>Error!</div>;
  }
})}
```

**Tool Execution Approval (UI):**

```tsx
// part.state === 'output-available' && part.needsApproval
const { addToolApprovalResponse } = useChat();
addToolApprovalResponse({ toolCallId: part.toolCallId, approved: true });
```

## Completion (`useCompletion`)

Single prompt → completion, not chat. From `@ai-sdk/react`.

```tsx
import { useCompletion } from '@ai-sdk/react';
const { completion, complete, isLoading, stop, error } = useCompletion({ api: '/api/completion' });
```

Server: use `streamText` → `toTextStreamResponse()`.

## Object Generation (`useObject`)

Stream structured objects to the client.

```tsx
import { experimental_useObject as useObject } from '@ai-sdk/react';
const { object, submit, isLoading, error } = useObject({
  api: '/api/use-object',
  schema: z.object({ ... }),
});
```

Server: `streamText({ output: Output.object({schema}) })` → `toUIMessageStreamResponse()`.

## Streaming Custom Data

Send arbitrary data alongside text/tool results.

**Server:**

```ts
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
const stream = createUIMessageStream({
  execute: ({ writer }) => {
    writer.write({ type: 'data-myCustomType', data: { key: 'value' } });
    const result = streamText({ model, messages });
    writer.merge(result.toUIMessageStream());
  },
});
return createUIMessageStreamResponse({ stream });
```

**Client:**

```tsx
const { data } = useChat({ onData: (d) => console.log(d) });
// data is an array of all received data parts
```

**Type-safe custom data:**

```ts
type MyDataTypes = { 'data-myCustomType': { key: string } };
type MyUIMessage = UIMessage<never, MyDataTypes>;
const { data } = useChat<MyUIMessage>();
```

## Error Handling (UI)

- `useChat` exposes `error` state (generic message recommended for security)
- `regenerate()` to retry last message
- Server: `result.toUIMessageStreamResponse({ onError: e => e.message })`
- Custom transport errors propagate to `error` state

## Transport API

Custom transport via `ChatTransport` interface:

```ts
class MyTransport implements ChatTransport {
  sendMessages({ messages, abortController, trigger, messageId, chatId, metadata }) {
    // Returns: ReadableStream<UIMessageStreamPart>
  }
}
```

`DefaultChatTransport` implements this with fetch + options.

## Stream Protocol

AI SDK uses a custom UI Message Stream protocol (text lines with type prefixes) for streaming structured data including text, tool calls, tool results, and metadata. Plain text streams also supported via `TextStreamChatTransport`.

## Reading UIMessage Streams

```ts
import { readUIMessageStream } from 'ai';
for await (const message of readUIMessageStream({ stream })) {
  // message is accumulated UIMessage so far
}
```

Used in subagent patterns to accumulate streamed output.

## Message Metadata

Attach arbitrary metadata to messages:

```ts
// Server:
result.toUIMessageStreamResponse({
  originalMessages: messages,
  messageMetadata: ({ part }) => {
    if (part.type === 'start') return { createdAt: Date.now(), model: 'claude-...' };
    if (part.type === 'finish') return { totalTokens: part.totalUsage.totalTokens };
  }
});
// Client: message.metadata.createdAt, message.metadata.totalTokens
```
