---
name: vercel-ai-sdk
description: >
  Comprehensive reference for the Vercel AI SDK (v6, latest). Use this skill whenever the user asks
  about building AI applications with the Vercel AI SDK, including: generating text (generateText/streamText),
  structured output (Output.object/array/choice/json), tool calling, multi-step agents, the ToolLoopAgent class,
  useChat hook, useCompletion, useObject, streaming custom data, embeddings, middleware, MCP tools,
  provider management, image/speech/transcription generation, error handling, testing, telemetry,
  Next.js App Router setup with AI SDK, workflow patterns (sequential/parallel/orchestrator/evaluator),
  loop control (stopWhen/prepareStep), memory providers, subagents, and all AI SDK UI features.
  Also use for questions about any specific AI SDK function, hook, type, or concept, even if not
  explicitly framed as an AI SDK question (e.g. "how do I stream responses in Next.js with AI").
---

# Vercel AI SDK v6 — Complete Reference

The AI SDK is Vercel's TypeScript toolkit for building AI-powered applications.
It has two main libraries: **AI SDK Core** (server-side generation) and **AI SDK UI** (React/framework hooks).
Current version: **v6**. Package: `ai` (core), `@ai-sdk/react` (UI hooks).

- Docs: https://ai-sdk.dev
- Package: `ai`, `@ai-sdk/react`

## Agent workflow

When helping with AI SDK tasks:

1. **Identify the layer** — Core (`generateText`/`streamText`) vs UI (`useChat`/transports) vs Agents (`ToolLoopAgent`)
2. **Read the relevant reference** below before writing code — v6 APIs differ significantly from older versions
3. **Prefer AI Gateway** — model string like `"anthropic/claude-sonnet-4-6"` with `AI_GATEWAY_API_KEY`
4. **Check gotchas** — see [types-and-gotchas.md](references/types-and-gotchas.md) for common mistakes (`parts` not `content`, `convertToModelMessages`, etc.)

## Quick routing

| Task                                               | Read first                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| New chat app in Next.js                            | [nextjs-quickstart.md](references/nextjs-quickstart.md)           |
| Concepts, providers, prompts, streaming basics     | [foundations.md](references/foundations.md)                       |
| Agents, workflows, loop control, memory, subagents | [agents.md](references/agents.md)                                 |
| `generateText`, `streamText`, structured output    | [core-api.md](references/core-api.md)                             |
| Tool calling, MCP, approval flow                   | [tools.md](references/tools.md)                                   |
| Embeddings, image, speech, transcription           | [embeddings-and-media.md](references/embeddings-and-media.md)     |
| Middleware, providers, errors, testing, telemetry  | [providers-and-advanced.md](references/providers-and-advanced.md) |
| `useChat`, transports, persistence, custom data    | [ui-hooks.md](references/ui-hooks.md)                             |
| Types table, gotchas                               | [types-and-gotchas.md](references/types-and-gotchas.md)           |

## References

Detailed guides are split into separate files to keep context lean:

- **[references/foundations.md](references/foundations.md)**: Core concepts, providers, prompt types, message parts, tools foundations, streaming
- **[references/nextjs-quickstart.md](references/nextjs-quickstart.md)**: Next.js App Router setup — route handler, client component, adding tools
- **[references/agents.md](references/agents.md)**: ToolLoopAgent, workflow patterns, loop control, memory, subagents
- **[references/core-api.md](references/core-api.md)**: `generateText`, `streamText`, structured output (`Output.*`), settings, event callbacks
- **[references/tools.md](references/tools.md)**: Tool definition, multi-step calls, dynamic tools, approval flow, MCP, repair, errors
- **[references/embeddings-and-media.md](references/embeddings-and-media.md)**: Embeddings, image generation, transcription, speech
- **[references/providers-and-advanced.md](references/providers-and-advanced.md)**: Middleware, provider registry, error handling, testing, telemetry
- **[references/ui-hooks.md](references/ui-hooks.md)**: `useChat`, `useCompletion`, `useObject`, custom data streams, transport, persistence, resume
- **[references/types-and-gotchas.md](references/types-and-gotchas.md)**: Key types reference and important notes
