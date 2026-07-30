---
name: ai-sdk
description: >-
  Vercel AI SDK (package `ai`, v6+). Use for generateText/streamText, ToolLoopAgent,
  tools, structured output, embeddings/media, useChat/useCompletion/useObject,
  Next.js App Router AI routes, workflows, providers, AI Gateway, MCP, and AI SDK
  troubleshooting. Triggers: "AI SDK", "Vercel AI SDK", generateText, streamText,
  useChat, ToolLoopAgent, structured output, tool calling, embeddings, AI Gateway.
---

# AI SDK (Vercel) — unified skill

Canonical skill for the TypeScript AI SDK (`ai`, `@ai-sdk/react`). Merges the former
workflow pack and the v6 reference pack into one skill.

- Docs: https://ai-sdk.dev
- Packages: `ai` (core), `@ai-sdk/react` (UI hooks)

## Prerequisites

Before searching docs, check if `node_modules/ai/docs/` exists. If not, install **only** the `ai` package with the project package manager (e.g. `pnpm add ai`).

Install provider packages (`@ai-sdk/openai`, etc.) and `@ai-sdk/react` only when needed.

## Critical: do not trust internal knowledge

AI SDK APIs change often. Training data is often wrong.

1. Ensure `ai` is installed
2. Search `node_modules/ai/docs/` and `node_modules/ai/src/` for current APIs
3. If missing locally, use ai-sdk.dev (see Finding Documentation)
4. Never rely on memory — verify against source or docs
5. **`useChat` changed significantly** — check [common-errors.md](references/common-errors.md) before client code
6. Prefer **Vercel AI Gateway** unless the user specifies otherwise — [ai-gateway.md](references/ai-gateway.md)
7. **Fetch current model IDs** before coding — e.g. `curl -s https://ai-gateway.vercel.sh/v1/models | jq -r '[.data[] | select(.id | startswith("provider/")) | .id] | reverse | .[]'` (swap `provider`)
8. Run typecheck after changes
9. Be minimal — only override defaults you verified

## Agent workflow

1. Identify the layer — Core (`generateText`/`streamText`) vs UI (`useChat`) vs Agents (`ToolLoopAgent`)
2. Read the relevant reference below before writing code
3. Prefer AI Gateway model strings like `"anthropic/claude-sonnet-4-6"` with `AI_GATEWAY_API_KEY`
4. Check [types-and-gotchas.md](references/types-and-gotchas.md)

## Quick routing

| Task | Read first |
|------|------------|
| New chat app in Next.js | [nextjs-quickstart.md](references/nextjs-quickstart.md) |
| Concepts, providers, streaming basics | [foundations.md](references/foundations.md) |
| Agents, workflows, loop control, memory, subagents | [agents.md](references/agents.md) |
| `generateText`, `streamText`, structured output | [core-api.md](references/core-api.md) |
| Tool calling, MCP, approval | [tools.md](references/tools.md) |
| Embeddings, image, speech, transcription | [embeddings-and-media.md](references/embeddings-and-media.md) |
| Middleware, providers, errors, testing, telemetry | [providers-and-advanced.md](references/providers-and-advanced.md) |
| `useChat`, transports, persistence, custom data | [ui-hooks.md](references/ui-hooks.md) |
| Types + gotchas | [types-and-gotchas.md](references/types-and-gotchas.md) |
| Deprecated renames / common type errors | [common-errors.md](references/common-errors.md) |
| AI Gateway setup | [ai-gateway.md](references/ai-gateway.md) |
| Type-safe agents + `useChat` | [type-safe-agents.md](references/type-safe-agents.md) |
| Local DevTools / observability | [devtools.md](references/devtools.md) |

## Finding documentation

### ai@6.0.34+

- Docs: `grep "query" node_modules/ai/docs/`
- Source: `grep "query" node_modules/ai/src/`
- Providers: `node_modules/@ai-sdk/<provider>/docs/`

### Earlier versions

1. Search: `https://ai-sdk.dev/api/search-docs?q=your_query`
2. Fetch `.md` URLs from results

## When typecheck fails

Grep [common-errors.md](references/common-errors.md) first. Then search `node_modules/ai/{src,docs}/` and ai-sdk.dev.

## Building agents

Use `ToolLoopAgent`. See [agents.md](references/agents.md) and [type-safe-agents.md](references/type-safe-agents.md). Prefer `InferAgentUIMessage<typeof agent>` with `useChat`.

Detect the app framework from `package.json` and follow that stack’s quickstart ([nextjs-quickstart.md](references/nextjs-quickstart.md) for App Router).

## Major docs links

- [Agents](https://ai-sdk.dev/docs/agents)
- [Building agents](https://ai-sdk.dev/docs/agents/building-agents)
- [Workflows](https://ai-sdk.dev/docs/agents/workflows)
- [Loop controls](https://ai-sdk.dev/docs/agents/loop-control)
- [Memory](https://ai-sdk.dev/docs/agents/memory)
- [Subagents](https://ai-sdk.dev/docs/agents/subagents)
