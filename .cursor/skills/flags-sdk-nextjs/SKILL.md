---
name: flags-sdk-nextjs
description: >
  Implements feature flags and A/B tests in Next.js with the Flags SDK (`flags/next`).
  Use when declaring flags in `flags.ts`, evaluating flags in App Router server components,
  Pages Router `getServerSideProps`, middleware/proxy rewrites, the precompute pattern for
  static pages, `generatePermutations`, `FLAGS_SECRET`, or Flags Explorer overrides.
  Triggers: flags/next, feature flags Next.js, precompute, proxy middleware flags,
  `generateStaticParams` flags, Flags Explorer Next.js.
---

# Flags SDK for Next.js

Open-source feature flags library from the Next.js team. Works with any provider; compatible with App Router, Pages Router, and middleware/proxy.

- Docs: https://flags-sdk.dev/docs/frameworks/next
- Full provider/adapter/CLI guide: [flags-sdk](../flags-sdk/SKILL.md)

## Install

```sh
pnpm i flags
```

For Vercel Flags as provider, also install `@flags-sdk/vercel` and follow the [flags-sdk agent workflow](../flags-sdk/SKILL.md#agent-workflow-creating-a-new-flag).

## Declare a flag

Create `flags.ts` (or `lib/flags.ts`) at the project root:

```ts
import { flag } from 'flags/next';

export const exampleFlag = flag({
  key: 'example-flag',
  decide() {
    return Math.random() > 0.5;
  },
});
```

Each declaration exports a **callable function**. Call sites use the function, not string keys.

## Choose an evaluation pattern

| Scenario | Pattern |
| -------- | ------- |
| Single dynamic page, few flags | `await flag()` in server component or proxy |
| Static/ISR page with flags | [Precompute](precompute.md) via proxy rewrite |
| Authenticated dashboard | `identify` + `dedupe` (App Router / proxy only) |
| Managed flags on Vercel | `vercelAdapter()` — see [flags-sdk](../flags-sdk/SKILL.md) |

## App Router

Call the flag from any async server component, layout, or proxy:

```tsx
import { exampleFlag } from '../flags';

export default async function Page() {
  const example = await exampleFlag();
  return <div>{example ? 'Flag is on' : 'Flag is off'}</div>;
}
```

## Pages Router

Pass `req` in `getServerSideProps`:

```tsx
import type { InferGetServerSidePropsType, GetServerSideProps } from 'next';
import { exampleFlag } from '../flags';

export const getServerSideProps = (async ({ req }) => {
  const example = await exampleFlag(req);
  return { props: { example } };
}) satisfies GetServerSideProps<{ example: boolean }>;

export default function Page({
  example,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <div>{example ? 'Flag is on' : 'Flag is off'}</div>;
}
```

## Proxy (middleware)

Use proxy to rewrite requests to flag-driven variants. For a single boolean flag:

```ts
// proxy.ts
import { type NextRequest, NextResponse } from 'next/server';
import { exampleFlag } from './flags';

export const config = { matcher: ['/example'] };

export async function proxy(request: NextRequest) {
  const active = await exampleFlag();
  const variant = active ? 'variant-on' : 'variant-off';
  return NextResponse.rewrite(new URL(`/example/${variant}`, request.url));
}
```

For **multiple flags** or **static pages**, use [precompute](precompute.md) instead of duplicating page files.

## Flags Explorer

Part of the Vercel Toolbar. Overrides apply to your session only; the SDK respects them automatically.

Setup checklist:

1. Install and render `@vercel/toolbar` — see [flags-sdk nextjs reference](../flags-sdk/references/nextjs.md#toolbar-setup)
2. Add discovery endpoint:

```ts
// app/.well-known/vercel/flags/route.ts
import { createFlagsDiscoveryEndpoint } from 'flags/next';
import { getProviderData } from '@flags-sdk/vercel';
import * as flags from '../../../../flags';

export const GET = createFlagsDiscoveryEndpoint(async () => {
  return getProviderData(flags);
});
```

## Evaluation context

Use `identify` to pass user/visitor context into `decide`. Wrap shared identify logic in `dedupe` so it runs once per request:

```ts
import { dedupe, flag } from 'flags/next';
import type { ReadonlyRequestCookies } from 'flags';

const identify = dedupe(
  ({ cookies }: { cookies: ReadonlyRequestCookies }) => ({
    user: cookies.get('user-id')?.value
      ? { id: cookies.get('user-id')!.value }
      : undefined,
  }),
);

export const dashboardFlag = flag<boolean>({
  key: 'new-dashboard',
  identify,
  decide({ entities }) {
    return entities?.user?.id === 'user1';
  },
});
```

`dedupe` is **not** available in Pages Router.

## Precompute (static pages)

Server-side flag evaluation keeps pages static and avoids layout shift. Middleware evaluates flags, encodes results into the URL, and the page reads precomputed values without re-running `decide`.

Requires `FLAGS_SECRET` (32 random bytes, base64url). Full walkthrough: [precompute.md](precompute.md).

Quick flow:

1. Group flags: `export const marketingFlags = [flagA, flagB] as const`
2. Proxy: `const code = await precompute(marketingFlags)` → rewrite to `/${code}/path`
3. Page: `await flagA(code, marketingFlags)`
4. Optional ISR: `generateStaticParams` returning `[]` or `generatePermutations(flags)`

## Agent workflow: add a flag to a Next.js page

1. Check if `flags` is installed; add with the project's package manager if not.
2. Add declaration to existing `flags.ts` or create it.
3. If using Vercel Flags, follow [flags-sdk workflow](../flags-sdk/SKILL.md#agent-workflow-creating-a-new-flag) (CLI + `vercelAdapter()`).
4. Pick pattern: direct `await` vs precompute (static/ISR).
5. If Flags Explorer is needed, verify toolbar + discovery endpoint exist.
6. Declare `options` on flags used with precompute or Flags Explorer.

## Additional resources

- [precompute.md](precompute.md) — precompute pattern, ISR, `generatePermutations`, multiple groups
- [flags-sdk](../flags-sdk/SKILL.md) — Vercel CLI, adapters, encryption, React components
- [flags-sdk/references/nextjs.md](../flags-sdk/references/nextjs.md) — dashboard pages, marketing A/B, suspense fallbacks
