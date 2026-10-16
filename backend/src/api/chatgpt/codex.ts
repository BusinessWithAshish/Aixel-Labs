/**
 * One image from the ChatGPT subscription, through the Codex CLI.
 *
 * The browser path (`generateChatGpt`) needs the account signed into the VPS
 * Chrome. An account that cannot be signed in there can still sign the CLI in
 * with a device code, and the CLI has the same image model behind its built-in
 * image tool. This spawns `codex exec` for a new image, or `codex exec resume`
 * to revise one in the session that made it, reads the session id off the
 * CLI's JSON event stream, and picks the image up from where the CLI saves it
 * (`$CODEX_HOME/generated_images/<session id>/`).
 *
 * Nothing here reads or writes the browser profile, so it never contends with
 * `generateChatGpt`; `busy` serialises this path's own calls.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

import { assertPersistentDisk } from "../../config";
import {
  CHATGPT,
  CHATGPT_CODEX,
  CHATGPT_ERROR_MESSAGES,
  resolveChatGptAccount,
} from "./constants";
import type { CHATGPT_CODEX_IMAGE_REQUEST_PARSED, CHATGPT_CODEX_IMAGE_RESPONSE } from "./types";

let busy = false;

function fail(message: string, statusCode: number): Error {
  const err = new Error(message);
  (err as Error & { statusCode?: number }).statusCode = statusCode;
  return err;
}

async function exists(path: string, mode = fsConstants.R_OK): Promise<boolean> {
  return fs.access(path, mode).then(() => true).catch(() => false);
}

type CliRun = { sessionId: string; text: string; error: string; exitCode: number | null; stderr: string };

/** Run the CLI to completion and fold its JSONL events into what the caller needs. */
function runCli(args: string[], timeoutSec: number, codexHome: string): Promise<CliRun> {
  return new Promise((resolve) => {
    const child = spawn(CHATGPT_CODEX.BIN, args, {
      cwd: CHATGPT_CODEX.WORKDIR,
      env: { ...process.env, CODEX_HOME: codexHome },
      // stdin closed: with it open the CLI waits for "additional input" forever.
      stdio: ["ignore", "pipe", "pipe"],
    });
    const run: CliRun = { sessionId: "", text: "", error: "", exitCode: null, stderr: "" };
    let buffer = "";
    const onLine = (line: string) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line) as Record<string, unknown>;
      } catch {
        return; // the CLI prints the odd non-JSON banner line
      }
      if (event.type === "thread.started" && typeof event.thread_id === "string") {
        run.sessionId = event.thread_id;
      }
      const item = event.item as { type?: string; text?: string } | undefined;
      if (event.type === "item.completed" && item?.type === "agent_message" && item.text) {
        run.text = item.text;
      }
      if (event.type === "error" && typeof event.message === "string") run.error = event.message;
      const failure = event.error as { message?: string } | undefined;
      if (event.type === "turn.failed" && failure?.message) run.error = failure.message;
    };
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) onLine(line);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      run.stderr = (run.stderr + chunk.toString("utf8")).slice(-4000);
    });
    const timer = setTimeout(() => {
      run.error = run.error || `timed out after ${timeoutSec}s`;
      child.kill("SIGKILL");
    }, timeoutSec * 1000);
    child.on("error", (err) => {
      run.error = run.error || err.message;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (buffer.trim()) onLine(buffer);
      run.exitCode = code;
      resolve(run);
    });
  });
}

/** The newest image the CLI wrote for this session at or after `since`. */
async function newestImage(
  sessionId: string,
  since: number,
  codexHome: string,
): Promise<string | null> {
  const dir = join(codexHome, "generated_images", sessionId);
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  let best: { path: string; mtime: number } | null = null;
  for (const name of names) {
    if (!/\.(png|jpe?g|webp)$/i.test(name)) continue;
    const path = join(dir, name);
    const { mtimeMs } = await fs.stat(path);
    if (mtimeMs >= since && (!best || mtimeMs > best.mtime)) best = { path, mtime: mtimeMs };
  }
  return best?.path ?? null;
}

async function stagePublicJpeg(imagePath: string): Promise<string> {
  await fs.mkdir(CHATGPT.MEDIA_ROOT, { recursive: true });
  const name = `${randomBytes(24).toString("base64url")}.jpg`;
  await sharp(imagePath).jpeg({ quality: 95 }).toFile(`${CHATGPT.MEDIA_ROOT}/${name}`);
  return `${CHATGPT.MEDIA_PUBLIC_BASE}/${name}`;
}

async function buildPrompt(req: CHATGPT_CODEX_IMAGE_REQUEST_PARSED): Promise<string> {
  if (req.mode === "revise") {
    const notes = req.revise_notes?.trim();
    return [
      CHATGPT_CODEX.REVISE_PREAMBLE,
      `WHAT TO CHANGE:\n${req.prompt.trim()}`,
      notes ? `REVISION NOTES FROM HUMAN:\n${notes}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  const standing = req.instructions_file
    ? (await fs.readFile(req.instructions_file, "utf8")).trim()
    : "";
  return [
    CHATGPT_CODEX.PREAMBLE,
    standing ? `STANDING INSTRUCTIONS — follow these unless the request overrides them:\n${standing}` : "",
    `REQUEST:\n${req.prompt.trim()}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function generateCodexImage(
  req: CHATGPT_CODEX_IMAGE_REQUEST_PARSED,
): Promise<CHATGPT_CODEX_IMAGE_RESPONSE> {
  assertPersistentDisk(CHATGPT_ERROR_MESSAGES.CODEX_FAILED);
  if (busy) throw fail(CHATGPT_ERROR_MESSAGES.CODEX_BUSY, 409);
  if (!(await exists(CHATGPT_CODEX.BIN, fsConstants.X_OK))) {
    throw fail(`${CHATGPT_ERROR_MESSAGES.CODEX_NOT_INSTALLED}: ${CHATGPT_CODEX.BIN}`, 503);
  }
  const { name: accountName, account } = resolveChatGptAccount(req.account);
  const codexHome = account.codex_home;
  if (!codexHome) {
    throw fail(`${CHATGPT_ERROR_MESSAGES.CODEX_SIGNED_OUT} (account "${accountName}" has no Codex CLI login configured)`, 503);
  }
  if (!(await exists(join(codexHome, "auth.json")))) {
    throw fail(`${CHATGPT_ERROR_MESSAGES.CODEX_SIGNED_OUT} (account "${accountName}", home: ${codexHome})`, 503);
  }
  for (const path of [...(req.images ?? []), ...(req.instructions_file ? [req.instructions_file] : [])]) {
    if (!(await exists(path))) throw fail(`An attached file path does not exist: ${path}`, 400);
  }

  busy = true;
  try {
    await fs.mkdir(CHATGPT_CODEX.WORKDIR, { recursive: true });
    const prompt = await buildPrompt(req);
    // read-only sandbox: the image tool is not a shell command, and nothing
    // this call wants needs the CLI to write anywhere.
    const common = ["--skip-git-repo-check", "--json"];
    const images = (req.images ?? []).flatMap((path) => ["-i", path]);
    // `--` ends the options: `-i` takes a list, and without it the prompt is read as one more image.
    const args =
      req.mode === "revise" && req.session_id
        ? ["exec", "resume", req.session_id, ...common, ...images, "--", prompt]
        : ["exec", ...common, "-s", "read-only", ...images, "--", prompt];

    const startedAt = Date.now() - 2000;
    const run = await runCli(args, req.timeout_seconds ?? CHATGPT_CODEX.DEFAULT_TIMEOUT_SEC, codexHome);
    const sessionId = run.sessionId || (req.mode === "revise" ? (req.session_id ?? "") : "");

    if (/could not be refreshed|sign in again|not logged in|401 Unauthorized/i.test(`${run.error} ${run.stderr}`)) {
      throw fail(`${CHATGPT_ERROR_MESSAGES.CODEX_SIGNED_OUT} (account "${accountName}", home: ${codexHome})`, 503);
    }
    const imagePath = sessionId ? await newestImage(sessionId, startedAt, codexHome) : null;
    if (!imagePath) {
      // Say what the CLI said: a usage limit, a refusal and a crash all end here,
      // and they need different responses from the caller.
      const detail = run.error || run.text || run.stderr.trim().split("\n").pop() || `exit ${run.exitCode}`;
      throw fail(`${CHATGPT_ERROR_MESSAGES.CODEX_NO_IMAGE}: ${detail.slice(0, 400)}`, 502);
    }
    return {
      text: run.text || undefined,
      media_url: await stagePublicJpeg(imagePath),
      session_id: sessionId,
    };
  } finally {
    busy = false;
  }
}
