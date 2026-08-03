# Marketing home — module layout

Apex marketing landing at `/` (`http://localhost:3003`). Tenant app home stays on `{tenant}.localhost:3003` via middleware rewrite to `/home`.

## Layout

```
(marketing)/
├── constants.ts          # URLs, labels, logos, sections, booking options, motion
├── types.ts              # Shared TS building blocks
├── page.tsx / layout.tsx
├── README.md
└── _components/
    ├── primitives.tsx        # LandingSection, Reveal, Stagger*, CountUp
    ├── booking.tsx           # BookingProvider, drawer, StartFreeLink, BookCallButton
    ├── scroll-chrome.tsx     # ScrollProgress + ScrollHashSync
    ├── scraper-preview.tsx   # Form mock UI shared by hero + product
    ├── landing-shell.tsx     # Page orchestration + splash reveal
    ├── splash-screen.tsx
    ├── hero.tsx / hero-mockup.tsx
    ├── marketing-nav.tsx / marketing-footer.tsx
    └── …section components (pillars, product-bento, …)
```

## DRY map

| Concern | Location |
|---------|----------|
| App URL, host, email, welcome code, booking webhook | `constants.ts` |
| Brand logo paths + `LEAD_SOURCES` | `constants.ts` |
| Section anchors + nav + scroll-hash order | `SECTION_IDS` / `NAV_LINKS` / `SCROLL_HASH_SECTIONS` |
| Booking time slots / company sizes / empty form | `BOOKING_*` / `EMPTY_BOOKING_FORM` |
| Motion ease + reveal viewport | `EASE_OUT_EXPO` / `REVEAL_VIEWPORT` |
| Section chrome / reveals / count-up | `_components/primitives.tsx` |
| Booking + CTA links | `_components/booking.tsx` |
| Scroll progress + URL hash sync | `_components/scroll-chrome.tsx` |
| Form mock UI (hero + product) | `_components/scraper-preview.tsx` |
| Home href | `DEFAULT_HOME_PAGE_ROUTE` from `@/config/app-config` |

## Adding a field / source

1. Add logo path to `BRAND_LOGOS` (and `LEAD_SOURCES` if it is a primary scraper).
2. Prefer constants over string literals in section components.
3. Reuse `LandingSection` / `SectionEyebrow` / `Reveal` from `primitives.tsx`.
4. Scraper form previews go in `scraper-preview.tsx`.
5. CTAs: `StartFreeLink` / `BookCallButton` from `booking.tsx`.
