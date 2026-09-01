# Hermes → n8n learnings mapping (design only)

This pass documents how Hermes/Sova memory concepts map onto the n8n harness.
**Do not implement a learnings table or harvest workflows yet.**

## What Hermes actually does

| Mechanism | Role | Source |
|-----------|------|--------|
| **MEMORY.md / USER.md** | Bounded declarative memory injected every session; agent `add/replace/remove`; char caps force curation | [memory.md](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory) |
| **Skills + `skill_manage`** | Procedural memory — save workflows as SKILL.md; load on demand | [skills.md](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) |
| **Self-improvement loop** | Memory (always-on facts) + skills (procedures); optional `write_approval` gate | same |
| **Curator** | Background **skill library hygiene** (stale → archive; optional LLM consolidate). Not “append what worked on a post.” | [curator.md](https://hermes-agent.nousresearch.com/docs/user-guide/features/curator) |
| **Sova `learnings.md`** | Craft outcomes: append-only “what we tried / what happened” under the cron skill | `sova/AGENTS.md` / Instagram skill refs |

Important: Hermes **Curator ≠ learnings.md**. Curator maintains the skill catalog; learnings are outcome notes that steer the next creative brief.

## Native n8n mapping (future)

| Hermes / Sova | n8n already or later |
|---------------|----------------------|
| MEMORY.md | **memory** Data Table + Memory Get/Add (exists) |
| Skills / skill_manage | **skills** Data Table + Skills Get/Add (exists) |
| learnings.md (craft outcomes) | Future **learnings** Data Table: append on Approve/Revise/Discard/Publish; inject last N into Build Brief |
| Curator | Later: scheduled n8n workflow to consolidate/archive unused skills rows (optional) |
| write_approval | Already mirrored by Telegram HITL before publish / before skill body updates |

## Later implementation sketch (not this pass)

1. Data Table `learnings`: `platform`, `account`, `outcome` (`approve`/`revise`/`discard`/`publish`), `notes`, `media_url`, `created_at`.
2. Sub-workflows Learnings Add / Learnings Get (last N for account).
3. On HITL + Publish terminals, append a row.
4. Build Brief concatenates last N learnings into the image prompt context.

Stop here until a dedicated implementation pass.
