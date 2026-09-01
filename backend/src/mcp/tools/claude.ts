import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { askClaude } from "../../api/claude/client";
import { budgetStatus } from "../../api/claude/budget";
import {
  CLAUDE_ASK_REQUEST_SCHEMA,
  CLAUDE_BUDGET_STATUS_REQUEST_SCHEMA,
} from "../../api/claude/schemas";
import { MCP_LAYER, registerDomainTool, type DomainOp } from "../domain-tool";

const CLAUDE_OPS: Record<string, DomainOp> = {
  ask: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: CLAUDE_ASK_REQUEST_SCHEMA,
      run: askClaude,
    },
  },
  budget_status: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: CLAUDE_BUDGET_STATUS_REQUEST_SCHEMA,
      run: async () => budgetStatus(),
    },
  },
};

const CLAUDE_DESCRIPTION = `Delegate a reasoning-heavy task to Claude Code running on the local Claude subscription (flat-rate, not metered API credits). Best for research, planning, analysis, architecture decisions, code review, hard debugging — work that benefits from stronger reasoning than the calling model. VPS only — every op fails fast unless AIXEL_VPS=1 is set on this host, so it never shells out from a local/dev run or Vercel.

Call with { op, input }.

Ops:
- ask — input: task, session_id? (continue a previous delegation, cheap — reuses the prompt cache), model?, effort? ("low"|"medium"|"high"), home_dir? (working directory; on a new session, if <home_dir>/SOUL.md and/or <home_dir>/memories/{USER,MEMORY}.md exist there they're auto-read and prepended as background — pass a Hermes profile dir for that profile's context, or any other directory for a plain delegation with just that cwd, or omit for neither), allow_tools? (comma-separated Claude Code tools, default read-only: Read,Grep,Glob,WebSearch,WebFetch — add Write,Edit,Bash only when the task must change files), max_turns? (default 12), timeout_seconds? (default 600). Returns { ok, session_id, text, usage } on success or { ok: false, error } — including a soft "blocked" response when the daily budget or an upstream usage limit is hit, which must not be retried. Prefer one session with several follow-ups over several fresh calls — a fresh session pays ~21K tokens of entry cost, a resumed one is near-free.
- budget_status — no input. Check the shared daily delegation budget (sessions/tokens used today, whether the breaker is open) before starting an expensive new delegation. The ledger is shared across every caller — all Hermes profiles and this backend — because the Claude subscription quota is per-account.`;

export function registerClaudeTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "claude",
    description: CLAUDE_DESCRIPTION,
    ops: CLAUDE_OPS,
  });
}
