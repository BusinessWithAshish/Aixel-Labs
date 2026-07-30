# Aixel Labs — Brand brief (paste this into any AI agent)

**How to use:** Copy this entire file into ChatGPT / Claude / Gemini / Cursor / CLI agents.
Also attach (or `@`-reference) the files in `assets/` so the agent can see the logo.

| File | Use |
|------|-----|
| `assets/aixellabs-logo.png` | Primary mark / icon (“A.”) — square, favicon-ready |
| `assets/aixellabs-full-logo.png` | Full lockup: mark + wordmark “Aixel Labs” |
| `assets/aixellabs-logo.svg` | Vector mark (same icon as PNG) |

In-app public URLs (Next.js): `/aixellabs-logo.png`, `/aixellabs-full-logo.png`, `/aixellabs-logo.svg`.

---

## 1. Brand identity

| | |
|--|--|
| **Brand name** | **Aixel Labs** |
| **Legal / company** | Aixel Labs — Pune, India |
| **Tagline / product line** | Agentic Lead management system |
| **Contact** | hello@aixellabs.in |
| **Website** | https://www.aixellabs.in |
| **App** | https://app.aixellabs.in |
| **Storage / keys prefix** | `aixellabs` |
| **Default theme hex (tenant fallback)** | `#4f46e5` (indigo) |

**Name note:** Spelled **Aixel** (not “Pixel”). The logo mark is a stylized **“A.”** (folded ribbon “A” + period/dot). Do not rebrand as Pixel Labs.

### Voice & personality

- Modern, tech-forward, multi-tenant SaaS
- Practical and agentic: AI-assisted lead workflows, not decorative fluff
- Clear, professional B2B product language
- Confident purple / violet system — premium but usable in dense dashboards

### What the product does (agent context)

Aixel Labs is a **multi-tenant agentic lead management platform**:

1. **Lead generation (core)** — credited scrapers for Google Maps (+ advanced), Google Advanced Search, Instagram Search, Facebook, LinkedIn; save into lead lists; debit credits after successful scrape.
2. **Auth & tenancy** — Firebase identity ↔ Mongo membership; subdomain tenants (`IFRAME` / `PRODUCT` / `EXTERNAL`); admin manage-tenants; device fingerprinting.
3. **Credits & coupons** — per-item costs; admins are credit-exempt.
4. **Messaging / voice (partial)** — SMS & WhatsApp (Twilio); web dialer; some module shells still placeholders.
5. **Intelligence / MCP** — YouTube + Google Trends APIs and MCP tools (backend); product UI still emerging.

Tenants can override **logo URL**, **theme color**, **label**, and **app description** — but the **default Aixel Labs brand** below is the SSOT for marketing, empty-tenant, and agent design work unless a tenant override is specified.

---

## 2. Logo system

### Mark (icon) — `aixellabs-logo.png` / `.svg`

- Stylized **“A.”**: continuous thick ribbon folded into a 3D “A”; circular negative-space cutout near the top; small solid **dot** at bottom-right (reads as “A.”).
- Gradient purple/violet “liquid metal” look: deep near-black violet in recesses → bright lavender/indigo on highlights.
- Soft pale lavender / off-white backdrop in the asset files.
- **Use for:** favicon, avatar, app icon, compact nav, loading marks.
- **Clear space:** keep ~⅛ of the mark’s height empty around it; don’t crop the dot.
- **Don’t:** recolor randomly, flatten to a single flat purple without gradient unless producing a monochrome lockup, stretch, add drop shadows that fight the built-in depth, or replace with a generic letter “A”.

### Full lockup — `aixellabs-full-logo.png`

- Horizontal: **mark on the left** + wordmark **“ixel Labs”** in bold modern sans (together with the mark = **“Aixel Labs”**).
- Wordmark color: solid vibrant purple aligned with mid-tones of the mark.
- **Use for:** marketing, login, emails, slide decks, README headers.
- **Don’t:** rearrange mark below text, change “Aixel” spelling, or use a different typeface for the wordmark in official lockups.

### Preferred backgrounds

| Background | Guidance |
|------------|----------|
| Light / white / pale lavender | Preferred — matches official assets |
| Dark UI | Prefer the mark alone; ensure contrast; avoid muddy purple-on-purple |
| Busy photos | Put mark in a simple light container or use monochrome white mark |

---

## 3. Color system (from `app/globals.css`)

Design tokens use **OKLCH**. Primary brand hue sits in the **purple / violet** range (~293°). Default tenant fallback hex: **`#4f46e5`**.

### Light mode (`:root`) — default product chrome

| Token | OKLCH | Role |
|-------|-------|------|
| `--background` | `oklch(1 0 0)` | Page background (white) |
| `--foreground` | `oklch(0.141 0.005 285.823)` | Primary text (near-black cool) |
| `--primary` | `oklch(0.606 0.25 292.717)` | Brand actions, links, focus |
| `--primary-foreground` | `oklch(0.969 0.016 293.756)` | Text on primary |
| `--secondary` / `--muted` / `--accent` | `oklch(0.967 0.001 286.375)` | Soft surfaces |
| `--muted-foreground` | `oklch(0.552 0.016 285.938)` | Secondary text |
| `--destructive` | `oklch(0.577 0.245 27.325)` | Errors / danger |
| `--border` / `--input` | `oklch(0.92 0.004 286.32)` | Borders |
| `--ring` | same as primary | Focus rings |
| `--sidebar` | `oklch(0.985 0 0)` | Sidebar surface |
| `--sidebar-primary` | same as primary | Sidebar active |

**Radius:** `--radius: 0.65rem` (slightly soft cards/buttons; not fully pill-by-default).

### Dark mode (`.dark`)

| Token | OKLCH | Notes |
|-------|-------|--------|
| `--background` | `oklch(0.141 0.005 285.823)` | Deep cool charcoal |
| `--foreground` | `oklch(0.985 0 0)` | Near white |
| `--primary` | `oklch(0.541 0.281 293.009)` | Brighter violet for dark UI |
| `--card` / `--popover` | `oklch(0.21 0.006 285.885)` | Elevated surfaces |
| Borders | white @ 10–15% alpha | Subtle |

### Optional theme accents (tenant / user themes)

These override **primary / ring / sidebar-primary** only:

| Class | Primary OKLCH | Feel |
|-------|---------------|------|
| `.blue` / `.blue-dark` | `oklch(0.488 0.243 264.376)` | Blue |
| `.rose` | `oklch(0.586 0.253 17.585)` | Rose |
| `.rose-dark` | `oklch(0.645 0.246 16.439)` | Rose (dark) |
| `.green` / `.green-dark` | `oklch(0.648 0.2 131.684)` | Green |

**Default brand = purple/violet primary**, not blue/rose/green. Use accent themes only when implementing the in-app theme switcher.

### Charts

Light chart tokens (`--chart-1` … `--chart-5`) mix warm orange, teal, blue, yellow-green — for data viz only, not for primary CTAs.

### Motion / AI chrome

Utility animations exist for AI UI: `animate-ai-rainbow-flow`, `animate-ai-shimmer`, `animate-ai-pulse-glow`. Use sparingly on AI input / generative surfaces — not on every button.

### Scrollbars

Thin scrollbars tinted with `--primary` on muted track — keep product chrome consistent with brand purple.

---

## 4. Typography

- **App UI font:** **Inter** (`next/font/google` — `frontend/helpers/fonts.ts`).
- Clean geometric sans; good for dense tables, forms, and dashboards.
- Wordmark in the full logo is a **bold sans** matching the purple mid-tone — do not substitute a serif or display script for official lockups.
- Hierarchy: prefer weight + muted-foreground over decorative fonts.

---

## 5. UI / product design rules for agents

When generating UI, marketing pages, or mockups for Aixel Labs:

1. **Brand first:** On branded surfaces, “Aixel Labs” + mark should read as the hero identity, not a tiny nav afterthought.
2. **Purple primary CTAs** using the primary token; white/light backgrounds by default; support dark mode with the dark tokens above.
3. **Radius ~0.65rem** family — soft, not extreme pill soup.
4. **Density:** product is a dashboard / lead-ops tool — prioritize clarity, forms, tables, and lead cards over marketing collage.
5. **Multi-tenant:** allow optional tenant logo + theme color override; fall back to Aixel mark + `#4f46e5` / CSS primary.
6. **Avoid:** unrelated purple-on-white generic “AI startup” tropes that ignore the specific **A.** mark; don’t invent a second logo; don’t spell the brand “Pixel”.
7. **Imagery:** prefer product UI, maps/search lead context, or the official logos — not random stock robots.

---

## 6. Copy snippets (approved tone)

- **Short:** Aixel Labs — agentic lead management.
- **Medium:** Aixel Labs helps teams find, save, and act on leads across Maps, search, and social — with credits, multi-tenant workspaces, and agent-ready workflows.
- **CTA examples:** “Generate leads”, “Open lead list”, “Manage tenants”, “Redeem credits”.

---

## 7. Source of truth in the repo

| Concern | Path |
|---------|------|
| This brief | `frontend/brand-guidelines/BRAND.md` |
| Logo assets (pack) | `frontend/brand-guidelines/assets/` |
| Logo assets (served) | `frontend/public/aixellabs-*` |
| CSS tokens | `frontend/app/globals.css` |
| App name / description / default theme | `frontend/config/app-config.ts` |
| Font | `frontend/helpers/fonts.ts` |
| Legal entity strings | `frontend/app/(legal)/_constants.ts` |

When tokens and this brief disagree, **prefer live `globals.css` + `app-config.ts`**, then update this file.
