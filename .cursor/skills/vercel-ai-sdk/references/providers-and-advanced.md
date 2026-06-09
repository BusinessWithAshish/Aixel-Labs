# Providers, Middleware & Advanced

## Language Model Middleware

Wrap models to add RAG, guardrails, logging, caching, etc.:

```ts
import { wrapLanguageModel, experimental_customProvider } from 'ai';
const wrappedModel = wrapLanguageModel({ model: openai('gpt-4o'), middleware: myMiddleware });
// Middleware interface: wrapGenerate, wrapStream (return modified params/result)
// Built-in: defaultSettingsMiddleware (set defaults), extractReasoningMiddleware (parse <thinking> tags)
```

## Provider & Model Management

**Registry pattern:**

```ts
import { experimental_createProviderRegistry as createRegistry } from 'ai';
const registry = createRegistry({ openai, anthropic });
const model = registry.languageModel('openai:gpt-4o');
```

**Global provider** (Vercel AI Gateway is default):

```ts
import { setGlobalProvider } from 'ai';
setGlobalProvider(myCustomProvider);
// Then use string model IDs: generateText({ model: 'my-model', ... })
```

**Custom provider:**

```ts
import { experimental_customProvider as customProvider } from 'ai';
const myProvider = customProvider({ languageModels: { 'my-model': openai('gpt-4o') } });
```

## Error Handling

```ts
import { APICallError, LoadAPIKeyError, NoSuchModelError } from 'ai';
try { await generateText({...}); }
catch (e) {
  if (APICallError.isInstance(e)) { e.statusCode, e.responseBody, e.url }
  if (LoadAPIKeyError.isInstance(e)) { /* missing env var */ }
}
// streamText: errors in stream, use onError callback
```

Error types: `APICallError`, `LoadAPIKeyError`, `NoSuchModelError`, `NoObjectGeneratedError`, `NoSuchToolError`, `InvalidToolInputError`, `ToolCallRepairError`, `InvalidPromptError`.

## Testing

```ts
import { MockLanguageModelV1 } from 'ai/test';
const mockModel = new MockLanguageModelV1({
  doGenerate: async () => ({ rawCall: {...}, finishReason: 'stop', usage: {...}, text: 'Hello!' }),
  doStream: async () => ({ stream: createMockStream([...chunks]), rawCall: {...} }),
});
```

## Telemetry (OpenTelemetry)

```ts
const result = await generateText({
  model, prompt,
  experimental_telemetry: {
    isEnabled: true,
    functionId: 'my-function',
    metadata: { userId: '123' },
    tracer: myOtelTracer, // optional custom tracer
    meter: myOtelMeter,   // optional custom meter
  },
});
// Spans: ai.generateText, ai.generateText.doGenerate, ai.streamText.doStream
// Attributes: ai.model.id, ai.prompt, ai.usage.inputTokens, etc.
```
