# Precompute in Next.js

Keep pages static when using feature flags. Middleware evaluates flags once; the encrypted `code` travels in the URL; pages read values without re-invoking `decide`.

Docs: https://flags-sdk.dev/docs/frameworks/next/precompute

## Prerequisites

`FLAGS_SECRET` must be set (32 random bytes, base64url-encoded). Use a distinct value per environment.

```sh
node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
```

```sh
vercel env add FLAGS_SECRET production --sensitive --value <production-secret>
vercel env add FLAGS_SECRET preview --sensitive --value <preview-secret>
vercel env add FLAGS_SECRET development --value <development-secret>
vercel env pull
```

## Manual vs precompute

**Manual** (two page files + proxy rewrite) works for one flag but does not scale across pages or multiple flags.

**Precompute** encodes all flag values into a short URL segment — one page file, many combinations.

## Implementation

### 1. Flag group

```ts
import { flag } from 'flags/next';

export const showSummerSale = flag({
  key: 'summer-sale',
  decide: () => false,
});

export const showBanner = flag({
  key: 'banner',
  decide: () => false,
});

export const marketingFlags = [showSummerSale, showBanner] as const;
```

### 2. Precompute in proxy

```ts
import { type NextRequest, NextResponse } from 'next/server';
import { precompute } from 'flags/next';
import { marketingFlags } from './flags';

export const config = { matcher: ['/'] };

export async function proxy(request: NextRequest) {
  const code = await precompute(marketingFlags);
  const nextUrl = new URL(
    `/${code}${request.nextUrl.pathname}${request.nextUrl.search}`,
    request.url,
  );
  return NextResponse.rewrite(nextUrl, { request });
}
```

### 3. Read in page

```tsx
import { marketingFlags, showSummerSale, showBanner } from '../../flags';

type Params = Promise<{ code: string }>;

export default async function Page({ params }: { params: Params }) {
  const { code } = await params;
  const summerSale = await showSummerSale(code, marketingFlags);
  const banner = await showBanner(code, marketingFlags);

  return (
    <div>
      {banner ? <p>welcome</p> : null}
      {summerSale ? <p>summer sale live now</p> : <p>summer sale starting soon</p>}
    </div>
  );
}
```

Route file: `app/[code]/page.tsx` (or nested segment — see below).

## ISR and build-time rendering

**ISR only** — enable caching without prebuilding all variants:

```tsx
export async function generateStaticParams() {
  return [];
}
```

**Build-time permutations** — prerender all declared combinations:

```tsx
import { generatePermutations } from 'flags/next';
import { marketingFlags } from '../../flags';

export async function generateStaticParams() {
  const codes = await generatePermutations(marketingFlags);
  return codes.map((code) => ({ code }));
}
```

Place `generateStaticParams` on the layout or page that owns the `[code]` segment.

### Pages Router

```tsx
import { generatePermutations } from 'flags/next';
import { marketingFlags, exampleFlag } from '../flags';

export const getStaticPaths = (async () => {
  const codes = await generatePermutations(marketingFlags);
  return {
    paths: codes.map((code) => ({ params: { code } })),
    fallback: 'blocking',
  };
}) satisfies GetStaticPaths;

export const getStaticProps = (async (context) => {
  if (typeof context.params?.code !== 'string') return { notFound: true };
  const example = await exampleFlag(context.params.code, marketingFlags);
  return { props: { example } };
}) satisfies GetStaticProps<{ example: boolean }>;
```

## Declaring options

Declare `options` for efficient URL encoding, `generatePermutations`, and Flags Explorer:

```ts
export const greetingFlag = flag<string>({
  key: 'greeting',
  options: [
    { label: 'Hello world', value: 'Hello world' },
    { label: 'Hi', value: 'Hi' },
  ],
  decide: () => 'Hello world',
});
```

Values not in `options` get inlined into the code and can exceed URL limits (keep under 1024 chars for ISR).

## Scoping precompute

### Single page (e.g. `/pricing`)

- Move page to `app/pricing/[pricingCode]/page.tsx`
- Export `pricingFlags` array used only on that page
- Proxy matcher: `/pricing` → rewrite to `/pricing/[pricingCode]`
- Page: `await discountFlag(pricingCode, pricingFlags)`

### Subset of app tree

Nest under `app/precomputed/[code]/` so only those routes use precomputed flags. Maintain proxy matchers manually.

### Multiple groups

Avoid combinatorial explosion — separate groups per page subset:

```ts
export const rootFlags = [navigationFlag, bannerFlag];
export const pricingFlags = [discountFlag];
```

```
app/[rootCode]/page.tsx
app/[rootCode]/pricing/[pricingCode]/page.tsx
```

Proxy precomputes each group; pass the matching `code` and group when reading flags.

## Combinatory explosion

Many flags or many option values → exponential permutations. Mitigations:

- Split into smaller flag groups per route
- Filter `generatePermutations` with a second argument for build-time subset
- Prefer on-demand ISR over full build-time prerender
