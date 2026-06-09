# Foundations

## Core Concepts

- **Generative AI**: Models predict statistically likely outputs from patterns learned in training.
- **LLMs**: Text-focused generative models. Assign probabilities to sequences; can hallucinate on absent info.
- **Embedding Models**: Convert data to dense vectors for semantic similarity comparisons (not generative).
- **Providers**: Companies (OpenAI, Anthropic, Google, etc.) offering model APIs.
- **Provider Architecture**: AI SDK standardizes across providers via a language model spec, enabling easy switching.

## Providers

Install per provider: `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/azure`, `@ai-sdk/groq`, etc.

- **Vercel AI Gateway** (default/recommended): access hundreds of models with one API key (`AI_GATEWAY_API_KEY`). Model string: `"anthropic/claude-sonnet-4-6"` or `gateway('openai/gpt-4o')`.
- **OpenAI-compatible**: `createOpenAICompatible()` for self-hosted or compatible APIs.
- **Community providers**: Ollama, OpenRouter, Mem0, Letta, Portkey, and many more.

## Prompt Types (used in `generateText`/`streamText`)

1. **Text prompt** (`prompt:`): Simple string, supports template literals.
2. **System prompt** (`system:`): Instruction passed before user messages; use `allowSystemInMessages` option to control system messages in `messages` array (warning by default, prevents prompt injection).
3. **Message prompt** (`messages:`): Array of `ModelMessage` objects with `role` ('user'|'assistant'|'tool'|'system') and `content`.

**Message content parts:**

- `{ type: 'text', text: '...' }` — plain text
- `{ type: 'image', image: Buffer|string|URL }` — image (base64, data URL, URL, ArrayBuffer)
- `{ type: 'file', data: Buffer|string, mediaType: 'application/pdf' }` — file (PDF, audio, etc.)
- `{ type: 'tool-call', toolCallId, toolName, input }` — assistant tool call
- `{ type: 'tool-result', toolCallId, toolName, output: {type:'json',value} | {type:'content',value:[...]} }` — tool result

**Provider options** can be set at function-call level, message level, or message-part level via `providerOptions: { anthropic: { cacheControl: {type:'ephemeral'} } }`.

**UIMessage vs ModelMessage**: `UIMessage` (from `useChat`) has metadata, timestamps, parts array. `ModelMessage` is what the model sees. Convert with `await convertToModelMessages(uiMessages)`. To filter incomplete tool calls: `convertToModelMessages(messages, { ignoreIncompleteToolCalls: true })`.

## Tools (Foundations)

A tool is an object with:

- `description`: optional, guides when model picks it
- `inputSchema`: Zod schema (`z.object({...})`), Valibot, or JSON schema
- `execute`: optional async function returning the result

**Three types:**

1. **Custom tools** — fully defined by you, provider-agnostic. Use `tool({ description, inputSchema, execute })`.
2. **Provider-defined tools** — schema/description from provider (e.g., `anthropic.tools.bash_20250124`), you supply `execute`. Model trained to use them well.
3. **Provider-executed tools** — run on provider servers (e.g., `openai.tools.webSearch()`). No execute needed.

**Schemas supported**: Zod v3/v4, Valibot via `valibotSchema()`, Standard JSON Schema, raw JSON via `jsonSchema()`.

## Streaming

`streamText` uses backpressure — tokens generated as requested. Always consume the stream.

Streaming improves UX vs blocking for long responses. `streamText` starts immediately; errors become part of the stream (use `onError` callback to log).
