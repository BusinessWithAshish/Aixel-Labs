/**
 * Shared delegation budget with a circuit breaker. Port of
 * hermes-claude-mcp/src/budget.js — same ledger file by default, so the
 * daily count carries over rather than resetting when callers move here.
 *
 * There is no quota API. `claude` exposes no usage/limit/quota subcommand,
 * and the `-p` JSON output reports tokens spent on that call but nothing
 * about remaining plan capacity. So this keeps its own ledger and enforces a
 * ceiling the operator sets via env.
 *
 * The ledger is deliberately GLOBAL, not per-caller. The Claude subscription
 * quota is per-account and shared across every Hermes profile and every
 * other caller (n8n included) — a per-caller budget would let each draw
 * "their" allowance and blow through the account limit many times over.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { assertVpsRuntime } from "../../config";
import { CLAUDE_BUDGET, CLAUDE_ERROR_MESSAGES } from "./constants";
import type { CLAUDE_BUDGET_LEDGER, CLAUDE_BUDGET_STATUS_RESPONSE, CLAUDE_USAGE } from "./types";

const today = (): string => new Date().toISOString().slice(0, 10);

function empty(): CLAUDE_BUDGET_LEDGER {
  return {
    day: today(),
    sessions: 0,
    resumes: 0,
    tokens_in: 0,
    tokens_out: 0,
    approaching_limit: false,
    limit_hit_at: null,
    last_warning: null,
  };
}

function load(): CLAUDE_BUDGET_LEDGER {
  try {
    if (!existsSync(CLAUDE_BUDGET.LEDGER_FILE)) return empty();
    const s = JSON.parse(readFileSync(CLAUDE_BUDGET.LEDGER_FILE, "utf8")) as CLAUDE_BUDGET_LEDGER;
    // Roll over at midnight. limit_hit_at clears too — a daily budget that
    // stays tripped forever is just an outage.
    if (s.day !== today()) return empty();
    return { ...empty(), ...s };
  } catch {
    return empty();
  }
}

/** Write atomically — several callers may delegate concurrently. */
function save(state: CLAUDE_BUDGET_LEDGER): void {
  try {
    mkdirSync(dirname(CLAUDE_BUDGET.LEDGER_FILE), { recursive: true });
    const tmp = `${CLAUDE_BUDGET.LEDGER_FILE}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, CLAUDE_BUDGET.LEDGER_FILE);
  } catch {
    // ledger is advisory; never fail a delegation over it
  }
}

/**
 * Decide whether a delegation may proceed.
 *
 * Resumes are always allowed, even when the breaker has tripped. A resumed
 * session reuses a warm prompt cache and costs a fraction of a cold start
 * (measured: 13 output tokens vs ~21K entry cost), so cutting off follow-ups
 * would waste sessions already paid for while saving almost nothing.
 */
export function checkBudget({ isResume }: { isResume: boolean }): {
  allowed: boolean;
  reason?: string;
} {
  const s = load();
  if (isResume) return { allowed: true };

  if (CLAUDE_BUDGET.DAILY_SESSIONS && s.sessions >= CLAUDE_BUDGET.DAILY_SESSIONS) {
    return {
      allowed: false,
      reason:
        `Daily delegation budget reached (${s.sessions}/${CLAUDE_BUDGET.DAILY_SESSIONS} new sessions today). ` +
        "Follow-ups on existing sessions still work — pass a session_id.",
    };
  }
  if (CLAUDE_BUDGET.DAILY_TOKENS && s.tokens_in + s.tokens_out >= CLAUDE_BUDGET.DAILY_TOKENS) {
    return {
      allowed: false,
      reason:
        `Daily token budget reached (${s.tokens_in + s.tokens_out}/${CLAUDE_BUDGET.DAILY_TOKENS}). ` +
        "Follow-ups on existing sessions still work — pass a session_id.",
    };
  }
  if (s.limit_hit_at) {
    return {
      allowed: false,
      reason:
        `Claude reported a usage limit at ${s.limit_hit_at} and the breaker is open for today. ` +
        "Follow-ups on existing sessions may still work.",
    };
  }
  return { allowed: true };
}

/** Record a completed delegation. */
export function recordBudget({
  isResume,
  usage,
  warning,
  limitHit,
}: {
  isResume: boolean;
  usage?: CLAUDE_USAGE;
  warning?: string | null;
  limitHit?: boolean;
}): void {
  const s = load();
  if (isResume) s.resumes += 1;
  else s.sessions += 1;
  s.tokens_in += usage?.input_tokens || 0;
  s.tokens_out += usage?.output_tokens || 0;
  if (warning) {
    s.approaching_limit = true;
    s.last_warning = warning.slice(0, 300);
  }
  if (limitHit) s.limit_hit_at = new Date().toISOString();
  save(s);
}

export function budgetStatus(): CLAUDE_BUDGET_STATUS_RESPONSE {
  assertVpsRuntime(CLAUDE_ERROR_MESSAGES.NOT_VPS);
  const s = load();
  const used = s.tokens_in + s.tokens_out;
  return {
    day: s.day,
    new_sessions_today: s.sessions,
    follow_ups_today: s.resumes,
    tokens_today: used,
    session_budget: CLAUDE_BUDGET.DAILY_SESSIONS || "unlimited",
    token_budget: CLAUDE_BUDGET.DAILY_TOKENS || "unlimited",
    sessions_remaining: CLAUDE_BUDGET.DAILY_SESSIONS
      ? Math.max(0, CLAUDE_BUDGET.DAILY_SESSIONS - s.sessions)
      : "unlimited",
    approaching_limit: s.approaching_limit,
    last_warning: s.last_warning,
    breaker_open: Boolean(s.limit_hit_at),
    limit_hit_at: s.limit_hit_at,
    safe_to_delegate: checkBudget({ isResume: false }).allowed,
    ledger: CLAUDE_BUDGET.LEDGER_FILE,
    note:
      "Claude exposes no quota API, so this is a self-imposed ledger, not a reading of your " +
      "actual plan usage. It is shared across every caller (all Hermes profiles and this " +
      "backend) because the subscription quota is per-account.",
  };
}
