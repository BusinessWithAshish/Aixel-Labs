# Agents

## Overview

Agents = LLMs + Tools + Loop. Three components:

- **LLM**: processes input, decides action
- **Tools**: extend capabilities
- **Loop**: context management + stopping conditions

## ToolLoopAgent Class (Recommended)

```ts
import { ToolLoopAgent, tool, stepCountIs } from 'ai';
const agent = new ToolLoopAgent({
  model: "anthropic/claude-sonnet-4-6",
  instructions: 'You are a helpful assistant.',
  tools: { myTool },
  stopWhen: stepCountIs(20), // default is 20
  toolChoice: 'auto', // 'auto'|'required'|'none'|{type:'tool',toolName:'...'}
});
// Usage:
const result = await agent.generate({ prompt: '...' });
const stream = await agent.stream({ prompt: '...' });
// API route:
import { createAgentUIStreamResponse } from 'ai';
return createAgentUIStreamResponse({ agent, uiMessages: messages });
```

**Loop stops when:**

- Finish reason other than tool-calls
- Tool without `execute` is invoked
- Tool call needs approval
- `stopWhen` condition met

**`onStepFinish` callback** (tracks per-step progress):

```ts
agent.generate({
  prompt: '...',
  onStepFinish: async ({ stepNumber, usage, finishReason, toolCalls }) => { ... }
});
```

Constructor-level + method-level callbacks both fire (constructor first).

**Type safety:**

```ts
import { InferAgentUIMessage } from 'ai';
type MyAgentMsg = InferAgentUIMessage<typeof myAgent>;
const { messages } = useChat<MyAgentMsg>();
```

## Workflow Patterns

**Sequential (Chains)**: Steps in order. Each output feeds next. Good for pipelines.

```ts
const { text: copy } = await generateText({ model, prompt: '...' });
const { output: quality } = await generateText({ model, output: Output.object({schema}), prompt: `evaluate: ${copy}` });
if (!quality.hasCallToAction) { /* regenerate */ }
```

**Routing**: First LLM call classifies, second call routes based on classification (different model/system).

```ts
const { output: classification } = await generateText({
  model, output: Output.object({ schema: z.object({ type: z.enum(['general','refund','technical']), complexity: z.enum(['simple','complex']) }) }),
  prompt: `Classify: ${query}`
});
const { text } = await generateText({
  model: classification.complexity === 'simple' ? 'openai/gpt-4o-mini' : 'openai/o4-mini',
  system: systemMap[classification.type],
  prompt: query,
});
```

**Parallel Processing**: `Promise.all()` for independent subtasks. Good for multi-aspect analysis.

**Orchestrator-Worker**: Primary model (orchestrator) plans, workers implement in parallel.

**Evaluator-Optimizer**: Loop with eval step checking quality, regenerating if below threshold. Good for translation, content generation.

## Loop Control

**Stop Conditions (`stopWhen`):**

- `stepCountIs(n)` — stop after n steps (default 20)
- `hasToolCall('toolName')` — stop when specific tool called
- `isLoopFinished()` — no limit (use cautiously!)
- Array: stops on any condition
- Custom: `({ steps }) => boolean`

**Cost-based custom condition:**

```ts
const budgetExceeded: StopCondition<typeof tools> = ({ steps }) => {
  const cost = steps.reduce((acc, s) => acc + (s.usage?.inputTokens??0)*0.01/1000, 0);
  return cost > 0.5;
};
```

**`prepareStep` callback**: Runs before each step. Can return `{ model, messages, activeTools, toolChoice }`:

```ts
prepareStep: async ({ stepNumber, steps, messages, model }) => {
  if (stepNumber > 2) return { model: strongerModel };
  if (messages.length > 20) return { messages: [messages[0], ...messages.slice(-10)] };
  if (stepNumber <= 2) return { activeTools: ['search'], toolChoice: 'required' };
  return {};
}
```

**Forced tool calling pattern** (always call tools):

```ts
tools: {
  search: searchTool,
  done: tool({ description: 'Signal done', inputSchema: z.object({ answer: z.string() }) }), // no execute
},
toolChoice: 'required',
// Access final answer: result.staticToolCalls[0].input.answer
```

**Manual loop:**

```ts
const messages: ModelMessage[] = [{ role: 'user', content: '...' }];
while (step < maxSteps) {
  const result = await generateText({ model, messages, tools });
  messages.push(...result.response.messages);
  if (result.text) break;
  step++;
}
```

## Memory (Agents)

Three approaches:

1. **Provider-Defined Tools** (low effort, provider lock-in):
   - Anthropic: `anthropic.tools.memory_20250818({ execute: async action => { /* map to storage */ } })`
2. **Memory Providers** (low effort, external dependency):
   - **Letta**: `lettaCloud()` — persistent long-term memory
   - **Mem0**: `createMem0({ provider, mem0ApiKey, apiKey })` — automatic extraction/retrieval
   - **Supermemory**: `supermemoryTools(API_KEY)` — addMemory + searchMemories tools
   - **Hindsight**: `createHindsightTools({ client, bankId })` — retain/recall/reflect tools
3. **Custom Tool** (high effort, full control):
   - Structured actions: view/create/update/search operations
   - Bash-backed: shell commands with validation (more powerful, needs safety)

## Subagents

A subagent is an agent invoked as a tool by a parent agent.

**Why use:**

- Offload context-heavy tasks (subagent uses 100k tokens, returns 1k summary)
- Parallelize independent research
- Isolate tool access

**When to avoid:** simple tasks, sequential processing, manageable context.

**Basic pattern (no streaming):**

```ts
const researchTool = tool({
  description: 'Research a topic',
  inputSchema: z.object({ task: z.string() }),
  execute: async ({ task }, { abortSignal }) => {
    const result = await researchSubagent.generate({ prompt: task, abortSignal });
    return result.text;
  },
});
```

**Streaming subagent progress** (with `readUIMessageStream`):

```ts
execute: async function* ({ task }, { abortSignal }) {
  const result = await researchSubagent.stream({ prompt: task, abortSignal });
  for await (const message of readUIMessageStream({ stream: result.toUIMessageStream() })) {
    yield message; // Each yield REPLACES previous (full UIMessage)
  }
},
// Control what model sees (summary only):
toModelOutput: ({ output: message }) => {
  const lastText = message?.parts.findLast(p => p.type === 'text');
  return { type: 'text', value: lastText?.text ?? 'Done.' };
},
```

**Caveats:**

- No `needsApproval` in subagent tools
- Subagent has isolated context window (fresh start per invocation)
- Pass `messages` to execute if you want main agent's history
- Streaming adds complexity — only add when needed

**Tool part states**: `input-streaming` → `input-available` → `output-available` (check `part.preliminary===true` for streaming) → `output-error`.
