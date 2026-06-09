# Key Types & Gotchas

## Key Types Reference

| Type | Description |
|------|-------------|
| `UIMessage` | Frontend message with parts[], metadata, id, role |
| `ModelMessage` | Backend message for model API calls |
| `ToolLoopAgent` | Class for creating reusable agents |
| `StopCondition<TOOLS>` | `({ steps }) => boolean` |
| `ToolSet` | `Record<string, tool>` |
| `TypedToolCall<TOOLS>` | Tool call with inferred types |
| `TypedToolResult<TOOLS>` | Tool result with inferred types |
| `InferAgentUIMessage<Agent>` | Infer UIMessage type from agent |
| `InferUITools<ToolSet>` | Infer UI tool types |
| `Output` | Namespace: `.text()`, `.object()`, `.array()`, `.choice()`, `.json()` |
| `LanguageModelUsage` | `{ inputTokens, outputTokens, totalTokens }` |

## Important Notes & Gotchas

1. **`stopWhen` default is `stepCountIs(20)`** in `ToolLoopAgent`, not unlimited.
2. **Structured output counts as a step** — add +1 to `stopWhen` when using tools + output together.
3. **`streamText` suppresses errors** — always provide `onError` callback.
4. **`useChat` uses `parts` not `content`** — render `message.parts.map(...)`, not `message.content`.
5. **`messages` vs `UIMessage`** — route handlers receive `UIMessage[]`, call `convertToModelMessages()` before passing to `generateText`/`streamText`.
6. **Tool part names**: `tool-{toolName}` where toolName is the key in your tools object.
7. **`isLoopFinished()` has no step limit** — can run forever and cost a lot.
8. **Subagent yield replaces, not appends** — each `yield` in generator execute sends the full accumulated message.
9. **`sendMessage` vs old `handleSubmit`** — v6 uses `sendMessage({text: input})` not `handleSubmit(e)`.
10. **Provider-options inheritance**: function-call level > message level > message-part level.
11. **`DirectChatTransport`** — for bypassing HTTP in server-side or single-process scenarios.
12. **`experimental_` prefix** — subject to breaking changes in minor versions.
13. **MCP vs AI SDK tools**: AI SDK tools are better for production (type safety, same process, full control). MCP for dev iteration.
14. **`response.messages`** — use to append assistant+tool messages to history for multi-turn conversations.
