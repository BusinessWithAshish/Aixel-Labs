# External skills

Vendor / downloaded / upstream skills (SDKs, frameworks, installable skills.sh packs).

**Usually unruled** — no project `.mdc` governor unless we need an in-repo usage constraint under `.cursor/rules/external/`.

Do not put Aixel-specific product conventions here — those belong under [`../frontend/`](../frontend/) or [`../backend/`](../backend/).

Keep `flags-sdk` and `flags-sdk-nextjs` as **siblings** so their relative `../flags-sdk/` links keep working.

`ai-sdk` is the **canonical** Vercel AI SDK skill (workflow + v6 reference set). The old duplicate `vercel-ai-sdk` skill was merged into it and removed.
