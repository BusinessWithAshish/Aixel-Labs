# Tool Calling & MCP

## Defining tools

```ts
import { tool, dynamicTool } from 'ai';
const myTool = tool({
  description: '...',
  inputSchema: z.object({ location: z.string() }),
  strict: true, // optional: force strict validation (provider-dependent)
  inputExamples: [{ input: { location: 'NYC' } }], // Anthropic only
  needsApproval: true, // or async ({ amount }) => amount > 1000
  execute: async ({ location }, { toolCallId, messages, abortSignal, experimental_context }) => { ... },
  // onInputStart, onInputDelta (streaming only), onInputAvailable
  toModelOutput: ({ output }) => ({ type: 'text', value: String(output) }), // multi-modal results
});
```

## Tool Execution Approval flow

1. First `generateText` call → `result.content` has `tool-approval-request` parts
2. Collect `{ type:'tool-approval-response', approvalId, approved: true/false, reason? }`
3. `messages.push({ role:'tool', content: approvals })`
4. Call `generateText` again — tool executes if approved

## Multi-step calls (`stopWhen`)

Automatically feeds tool results back for next generation.

```ts
const { text, steps } = await generateText({
  model, tools, stopWhen: stepCountIs(5), prompt,
  onStepFinish({ stepNumber, toolCalls, toolResults }) { ... },
  prepareStep: async ({ stepNumber, messages }) => { return { model: differentModel }; },
});
// response.messages — for history: messages.push(...result.response.messages)
```

## Dynamic tools

`dynamicTool`: For runtime-defined tools with unknown schemas. Check `toolCall.dynamic` for type narrowing.

## Preliminary tool results (generator function)

```ts
execute: async function*({ location }) {
  yield { status: 'loading', temperature: undefined };
  await delay(3000);
  yield { status: 'success', temperature: 72 };
}
```

## Tool choice & active tools

**`toolChoice`**: `'auto'` (default) | `'required'` | `'none'` | `{ type:'tool', toolName:'...' }`

**`activeTools`**: Array of tool names to expose at current step (for large tool sets).

## Tool call repair

`experimental_repairToolCall`: Fix malformed tool calls without extra steps. Use structured output on a repair model, or re-ask strategy.

## Tool errors

`NoSuchToolError`, `InvalidToolInputError`, `ToolCallRepairError`. Tool execution errors appear as `tool-error` content parts in steps.

## TypeScript types

`ToolCall<NAME, ARGS>`, `ToolResult<NAME, ARGS, RESULT>`, `TypedToolCall<TOOLS>`, `TypedToolResult<TOOLS>`, `ToolSet`

## MCP Tools

Connect to Model Context Protocol servers:

```ts
import { experimental_createMCPClient as createMCPClient } from 'ai';
const client = await createMCPClient({ transport: { type: 'sse', url: 'http://...' } });
const tools = await client.tools(); // or client.tools({ toolNameToId: {...} })
// Use in generateText/streamText: tools: { ...tools }
```

Prefer AI SDK tools for production (type safety, low latency). MCP for dev iteration and user-provided tools.
