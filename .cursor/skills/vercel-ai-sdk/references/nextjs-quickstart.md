# Getting Started: Next.js App Router

## Setup

```bash
pnpm create next-app@latest my-ai-app   # select App Router + Tailwind
pnpm add ai @ai-sdk/react zod
```

`.env.local`: `AI_GATEWAY_API_KEY=xxx`

## Route Handler (`app/api/chat/route.ts`)

```ts
import { streamText, UIMessage, convertToModelMessages } from 'ai';
export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const result = streamText({
    model: "anthropic/claude-sonnet-4-6",
    messages: await convertToModelMessages(messages),
  });
  return result.toUIMessageStreamResponse();
}
```

## Client Component (`app/page.tsx`)

```tsx
'use client';
import { useChat } from '@ai-sdk/react';
import { useState } from 'react';
export default function Chat() {
  const [input, setInput] = useState('');
  const { messages, sendMessage } = useChat();
  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>
          {m.role}: {m.parts.map((p,i) => p.type==='text' ? <span key={i}>{p.text}</span> : null)}
        </div>
      ))}
      <form onSubmit={e => { e.preventDefault(); sendMessage({text:input}); setInput(''); }}>
        <input value={input} onChange={e=>setInput(e.target.value)} />
      </form>
    </div>
  );
}
```

## Adding tools

```ts
// In route handler
import { tool, stepCountIs } from 'ai';
import { z } from 'zod';
const result = streamText({
  model: "anthropic/claude-sonnet-4-6",
  messages: await convertToModelMessages(messages),
  stopWhen: stepCountIs(5),
  tools: {
    weather: tool({
      description: 'Get weather',
      inputSchema: z.object({ location: z.string() }),
      execute: async ({ location }) => ({ location, temperature: 72 }),
    }),
  },
});
```

Tool parts on client are named `tool-{toolName}` (e.g. `part.type === 'tool-weather'`).
