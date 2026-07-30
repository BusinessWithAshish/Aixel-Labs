# AI SDK Core — generateText & streamText

## `generateText`

Non-interactive text generation. Returns promise.

```ts
import { generateText } from 'ai';
const { text, toolCalls, toolResults, finishReason, usage, totalUsage, steps, response, output } =
  await generateText({ model, prompt, system, messages, tools, stopWhen, output, providerOptions, ... });
```

**Key result properties:**

- `text`, `reasoning`, `reasoningText`, `files`, `sources`
- `toolCalls`, `toolResults` — last step
- `steps` — all steps with intermediate data
- `finishReason`, `rawFinishReason`, `usage`, `totalUsage`
- `response.messages` — for appending to history
- `response.headers`, `response.body` — raw provider response

**Callbacks:** `onFinish({ text, finishReason, usage, response, steps, totalUsage })`, `onStepFinish({ stepNumber, ... })`

**Experimental lifecycle callbacks:** `experimental_onStart`, `experimental_onStepStart`, `experimental_onToolCallStart`, `experimental_onToolCallFinish`

## `streamText`

Streaming text generation. Returns immediately; errors go into stream.

```ts
const result = streamText({ model, prompt, ...options, onError({ error }) { ... }, onChunk({ chunk }) { ... } });
for await (const textPart of result.textStream) { /* text deltas */ }
// OR consume fullStream for all event types
```

**Helper methods:**

- `result.toUIMessageStreamResponse()` — Next.js App Router response with tool calls
- `result.pipeUIMessageStreamToResponse(res)` — Node.js response
- `result.toTextStreamResponse()` — simple text HTTP response
- `result.pipeTextStreamToResponse(res)` — Node.js plain text

**`fullStream` events:** `start`, `start-step`, `text-start`, `text-delta`, `text-end`, `reasoning-start/delta/end`, `source`, `file`, `tool-call`, `tool-input-start/delta/end`, `tool-result`, `tool-error`, `finish-step`, `finish`, `error`, `raw`

**Stream transformations** (`experimental_transform`):

```ts
streamText({ model, prompt, experimental_transform: smoothStream() }); // built-in smoothing
// Custom: returns TransformStream. Call stopStream() + emit finish-step/finish to stop.
// Multiple transforms: experimental_transform: [first, second]
```

## Generating Structured Data

Use `output` property on `generateText`/`streamText` (replaces old `generateObject`/`streamObject`).

```ts
import { generateText, Output } from 'ai';
import { z } from 'zod';

const { output } = await generateText({
  model, output: Output.object({ schema: z.object({ name: z.string() }) }), prompt,
});
```

**Output types:**

- `Output.text()` — plain text (default)
- `Output.object({ schema, name?, description? })` — structured object with Zod validation
- `Output.array({ element: zodSchema, name?, description? })` — array of typed objects
  - With `streamText`: use `partialOutputStream` (partial) or `elementStream` (complete validated elements)
- `Output.choice({ options: string[] })` — enum classification
- `Output.json()` — any valid JSON, no schema validation

**Notes:**

- Structured output counts as a step — configure `stopWhen` accordingly when combined with tools
- `NoObjectGeneratedError` thrown when schema doesn't validate: has `.text`, `.response`, `.usage`, `.cause`
- Use `.describe('...')` on schema properties for better quality
- Access `result.reasoningText` for reasoning model chains

## Settings

Common settings for `generateText`/`streamText`:

- `temperature` (0-2), `maxOutputTokens`, `topP`, `topK`, `frequencyPenalty`, `presencePenalty`
- `stopSequences: string[]`, `seed` (integer for reproducibility)
- `maxRetries` (default 2), `abortSignal`, `headers`, `timeout`
- `providerOptions: { [provider]: { ... } }`

## Event Callbacks / Listeners

Beyond `onFinish` and `onStepFinish`:

- `onChunk` (streamText): called for each chunk, receives chunk type
- `experimental_onStart`, `experimental_onStepStart`, `experimental_onToolCallStart`, `experimental_onToolCallFinish`

All experimental callbacks silently catch errors.
