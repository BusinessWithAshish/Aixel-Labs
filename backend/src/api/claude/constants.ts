/**
 * Delegate a task to Claude Code on the local Claude subscription (flat-rate,
 * not metered API credits). Port of hermes-claude-mcp/src/{server,budget}.js —
 * that server is retired in favor of this shared backend service, callable
 * from Hermes profiles, n8n, and anything else that reaches this VPS.
 */

export const CLAUDE_ASK_FIELD_DESCRIPTIONS = {
  task: "The task or question for Claude. Be specific and self-contained.",
  session_id: "Continue a previous delegation. Omit to start a new session.",
  model:
    "Alias (opus|sonnet|haiku|fable) or full id (e.g. claude-sonnet-5). Default: the CLI default.",
  effort:
    "Reasoning effort. Use high for design/implementation/review; low for mechanical lookups. Costs more plan capacity at higher levels.",
  home_dir:
    "Working directory for the call, and (on a new session only) the source of an auto-attached context bundle: if <home_dir>/SOUL.md and/or <home_dir>/memories/{USER,MEMORY}.md exist, they're read and prepended as background. Generic on purpose — pass a Hermes profile dir (e.g. /home/ubuntu/.hermes/profiles/killjoy) for that profile's context, or any other directory for a plain delegation with just that cwd. Omit for no bundle, cwd defaults to the server's home.",
  allow_tools:
    "Comma-separated Claude Code tools. Default read-only. Add Write,Edit,Bash only when the task must change files.",
  max_turns: "Max agent turns. Default 12.",
  timeout_seconds: "Default 600.",
} as const;

export const CLAUDE_ASK = {
  BIN: process.env.CLAUDE_BIN || "claude",
  DEFAULT_TIMEOUT_SEC: Number(process.env.CLAUDE_DELEGATE_TIMEOUT || 600),
  DEFAULT_MAX_TURNS: 12,
  // Read-only by default: delegation is for thinking, not silently mutating
  // the filesystem. Callers that genuinely need write access opt in.
  DEFAULT_TOOLS: "Read,Grep,Glob,WebSearch,WebFetch",
} as const;

// Upstream conditions worth reporting as structured failures rather than as a
// plausible-looking answer a caller would act on unsupervised. Matched as
// PREFIXES against the trimmed result, never substrings — Claude analysing a
// codebase writes ordinary sentences like "you've used Express here", which a
// loose /you've used/ substring test misreads as a usage-limit banner.
export const CLAUDE_LIMIT_PREFIXES = [
  "You've hit your",
  "You've reached your",
  "You're out of usage",
  "You're out of extra usage",
  "Your usage limit",
  "Claude usage limit reached",
] as const;

export const CLAUDE_THIRD_PARTY_PREFIX = "Third-party apps now draw";
export const CLAUDE_API_ERROR_PREFIX = "API Error:";

// Approach-the-limit phrasing, also prefix-anchored.
export const CLAUDE_WARNING_PREFIXES = ["You've used", "You're close to"] as const;

export const CLAUDE_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid request parameters",
  BUDGET_BLOCKED: "Delegation blocked by daily budget",
  DELEGATION_FAILED: "Delegation failed",
  UNAVAILABLE: "Claude is unavailable",
  REPORTED_ERROR: "Claude reported an error",
  NOT_VPS:
    "Claude delegation requires the VPS — set AIXEL_VPS=1 on the one host that runs it",
} as const;

// Shared with every caller (Hermes profiles + this backend) — same default
// path hermes-claude-mcp used, so the daily count carries over rather than
// resetting when callers move to this endpoint.
export const CLAUDE_BUDGET = {
  LEDGER_FILE:
    process.env.CLAUDE_BUDGET_FILE || "/home/ubuntu/.claude-delegate-budget.json",
  // 0 or unset = unlimited (track but never block).
  DAILY_SESSIONS: Number(process.env.CLAUDE_DAILY_SESSIONS || 0),
  DAILY_TOKENS: Number(process.env.CLAUDE_DAILY_TOKENS || 0),
} as const;
