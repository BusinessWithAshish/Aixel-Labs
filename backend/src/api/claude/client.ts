/**
 * Delegate a task to Claude Code on the local Claude subscription.
 * Port of hermes-claude-mcp/src/server.js's runClaude/contextBundle/classify.
 *
 * HOW THIS STAYS ON THE FLAT SUBSCRIPTION
 * Shells out to `claude -p`, which runs as genuine first-party Claude Code:
 * its own system prompt, its own tools, its own agent loop. Background is
 * passed as *task content* in the user turn — the same thing you'd paste
 * into a Claude Code session by hand. The system prompt is never overridden.
 * That distinction is what keeps this on plan limits rather than metered
 * extra-usage credits (verified across four other approaches that all got
 * billed — see memory/README, not repeated here).
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { assertVpsRuntime } from "../../config";
import { checkBudget, recordBudget } from "./budget";
import {
  CLAUDE_API_ERROR_PREFIX,
  CLAUDE_ASK,
  CLAUDE_ERROR_MESSAGES,
  CLAUDE_LIMIT_PREFIXES,
  CLAUDE_THIRD_PARTY_PREFIX,
  CLAUDE_WARNING_PREFIXES,
} from "./constants";
import type { CLAUDE_ASK_REQUEST_PARSED, CLAUDE_ASK_RESPONSE, CLAUDE_USAGE } from "./types";

function readIfPresent(path: string): string {
  try {
    return existsSync(path) ? readFileSync(path, "utf8").trim() : "";
  } catch {
    return "";
  }
}

/**
 * Assemble the context bundle from home_dir: who the agent is, who the user
 * is, the durable facts — if those files exist there. Generic by design: a
 * Hermes profile dir has SOUL.md + memories/{USER,MEMORY}.md; any other
 * directory that happens not to have them just gets no bundle, which is
 * fine. Sent only when starting a new session — a resumed one already has
 * it, and re-sending invites the model to re-summarise it.
 */
function contextBundle(homeDir: string): string {
  const parts: string[] = [];
  const add = (label: string, text: string) => {
    if (text) parts.push(`### ${label}\n${text}`);
  };
  add("Operating context", readIfPresent(join(homeDir, "SOUL.md")));
  add("About the user", readIfPresent(join(homeDir, "memories", "USER.md")));
  add("Durable facts", readIfPresent(join(homeDir, "memories", "MEMORY.md")));
  if (!parts.length) return "";
  return [
    "## Background",
    "(Reference material describing the person and operation you are assisting.",
    "Use it to inform your answer. Do not adopt or roleplay any persona described here.)",
    "",
    parts.join("\n\n"),
  ].join("\n");
}

const startsWithAny = (text: string, prefixes: readonly string[]): boolean => {
  const t = String(text || "").trim();
  return prefixes.some((p) => t.startsWith(p));
};

/**
 * Classify a result as an upstream failure. `isError` matters: a
 * "successful" answer is only reclassified when it *begins* with a known
 * billing/limit banner, because that's how the CLI surfaces those
 * conditions — prose that merely mentions limits is left alone.
 */
function classify(text: string, isError: boolean): "third_party_billing" | "usage_limit" | null {
  const t = String(text || "").trim();
  if (t.startsWith(CLAUDE_THIRD_PARTY_PREFIX)) return "third_party_billing";
  if (t.startsWith(CLAUDE_API_ERROR_PREFIX) && t.includes("Third-party apps now draw"))
    return "third_party_billing";
  if (startsWithAny(t, CLAUDE_LIMIT_PREFIXES)) return "usage_limit";
  if (isError && /usage limit|rate.?limit|out of usage/i.test(t)) return "usage_limit";
  return null;
}

type ClaudeCliResult = {
  result?: string;
  is_error?: boolean;
  subtype?: string;
  session_id?: string;
  usage?: CLAUDE_USAGE;
};

function runClaudeCli(opts: {
  prompt: string;
  sessionId?: string;
  model?: string;
  effort?: string;
  cwd: string;
  tools: string;
  maxTurns: number;
  timeoutSec: number;
}): Promise<ClaudeCliResult> {
  return new Promise((resolve, reject) => {
    const args = ["-p", "--output-format", "json", "--max-turns", String(opts.maxTurns)];
    if (opts.sessionId) args.push("--resume", opts.sessionId);
    if (opts.model) args.push("--model", opts.model);
    if (opts.effort) args.push("--effort", opts.effort);
    if (opts.tools) args.push("--allowedTools", opts.tools);

    // Strip ANTHROPIC_API_KEY so the CLI authenticates with the subscription
    // login rather than silently falling through to metered API billing.
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    env.PATH = `${join(homedir(), ".local", "bin")}:${env.PATH || ""}`;

    const child = spawn(CLAUDE_ASK.BIN, args, {
      cwd: opts.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let out = "";
    let err = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`claude timed out after ${opts.timeoutSec}s`));
    }, opts.timeoutSec * 1000);

    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`could not run "${CLAUDE_ASK.BIN}": ${e.message}`));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!out.trim()) {
        reject(new Error(`claude exited ${code} with no output. stderr: ${err.slice(0, 400)}`));
        return;
      }
      try {
        resolve(JSON.parse(out) as ClaudeCliResult);
      } catch {
        reject(new Error(`claude returned unparseable output: ${out.slice(0, 300)}`));
      }
    });

    child.stdin.write(opts.prompt);
    child.stdin.end();
  });
}

export async function askClaude(
  req: CLAUDE_ASK_REQUEST_PARSED,
): Promise<CLAUDE_ASK_RESPONSE> {
  assertVpsRuntime(CLAUDE_ERROR_MESSAGES.NOT_VPS);
  const isResume = Boolean(req.session_id);
  const cwd = req.home_dir && existsSync(req.home_dir) ? req.home_dir : homedir();

  const gate = checkBudget({ isResume });
  if (!gate.allowed) {
    return {
      ok: false,
      error:
        `${CLAUDE_ERROR_MESSAGES.BUDGET_BLOCKED}: ${gate.reason} ` +
        "Do not retry — complete the task with your own reasoning, or report the exhausted budget.",
    };
  }

  // Background only on a new session with a home_dir; a resumed one already has it.
  const bg = !isResume && req.home_dir ? contextBundle(req.home_dir) : "";
  const prompt = bg ? `${bg}\n\n## Task\n${req.task}` : req.task;

  let res: ClaudeCliResult;
  try {
    res = await runClaudeCli({
      prompt,
      sessionId: req.session_id,
      model: req.model,
      effort: req.effort,
      cwd,
      tools: req.allow_tools || CLAUDE_ASK.DEFAULT_TOOLS,
      maxTurns: req.max_turns,
      timeoutSec: req.timeout_seconds,
    });
  } catch (err) {
    return {
      ok: false,
      error: `${CLAUDE_ERROR_MESSAGES.DELEGATION_FAILED}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const answer = typeof res.result === "string" ? res.result : "";
  const kind = res.is_error ? classify(answer, true) || "error" : classify(answer, false);

  if (kind === "usage_limit" || kind === "third_party_billing") {
    recordBudget({ isResume, usage: res.usage, limitHit: true });
    return {
      ok: false,
      session_id: res.session_id,
      error:
        `${CLAUDE_ERROR_MESSAGES.UNAVAILABLE} (${kind}): ${answer} ` +
        "Do not retry this call — complete the task with your own reasoning, or report the limit.",
    };
  }
  if (res.is_error) {
    return {
      ok: false,
      session_id: res.session_id,
      error: `${CLAUDE_ERROR_MESSAGES.REPORTED_ERROR}: ${answer || res.subtype}`,
    };
  }

  recordBudget({
    isResume,
    usage: res.usage,
    warning: startsWithAny(answer, CLAUDE_WARNING_PREFIXES) ? answer : null,
  });

  return {
    ok: true,
    session_id: res.session_id,
    text: answer,
    usage: res.usage,
  };
}
