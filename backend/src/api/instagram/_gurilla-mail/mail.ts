import Mailjs from "@cemalgnlts/mailjs";

const clients = new Map<string, Mailjs>();

export interface MailMessage {
  id: string;
  subject: string;
  intro?: string;
  from?: { address: string; name: string };
  createdAt?: string;
}

const DEFAULT_OPTIONS = { rateLimitRetries: 5 };

function apiErrorMessage(
  res: {
    status: boolean;
    statusCode?: number;
    message?: string;
    data?: unknown;
  },
  prefix: string,
): string {
  const code = res.statusCode ?? "";
  const msg = res.message;
  const data = res.data as Record<string, unknown> | undefined;
  if (msg && typeof msg === "string") return `${prefix}: ${msg}`;
  if (data?.detail != null) {
    const d = data.detail;
    const detailStr = Array.isArray(d)
      ? d
          .map((e: unknown) =>
            typeof e === "object" && e && "message" in e
              ? (e as { message: string }).message
              : String(e),
          )
          .join("; ")
      : String(d);
    return `${prefix} (${code}): ${detailStr}`;
  }
  if (data?.message != null) return `${prefix}: ${String(data.message)}`;
  return `${prefix} (HTTP ${code}). Check address not already used and domain is valid.`;
}

export async function createMail(username?: string): Promise<string> {
  const mailjs = new Mailjs(DEFAULT_OPTIONS);

  let email: string;
  let password: string;

  if (username && username.trim()) {
    const domainsRes = await mailjs.getDomains();
    if (!domainsRes.status || !domainsRes.data?.length) {
      throw new Error("Mailjs: no domains available");
    }
    const domain = domainsRes.data[0];
    const base = username.trim().toLowerCase().replace(/\s+/g, "");
    const unique = `${base}_${randomSuffix(6)}`;
    const address = `${unique}@${domain.domain}`;
    password = generatePassword();
    const registerRes = await mailjs.register(address, password);
    if (!registerRes.status) {
      throw new Error(apiErrorMessage(registerRes, "Mailjs register failed"));
    }
    const loginRes = await mailjs.login(address, password);
    if (!loginRes.status) {
      throw new Error(apiErrorMessage(loginRes, "Mailjs login failed"));
    }
    email = address;
  } else {
    const acc = await mailjs.createOneAccount();
    if (!acc.status || !acc.data) {
      throw new Error(apiErrorMessage(acc, "Mailjs createOneAccount failed"));
    }
    email = acc.data.username;
    password = acc.data.password;
  }

  clients.set(email, mailjs);
  return email;
}

export async function fetchMailMessages(email: string): Promise<MailMessage[]> {
  const mailjs = clients.get(email);
  if (!mailjs) {
    throw new Error(
      "No Mailjs session for this email. Create it with createMail() first.",
    );
  }
  const res = await mailjs.getMessages();
  if (!res.status) {
    throw new Error(apiErrorMessage(res, "Mailjs getMessages failed"));
  }
  const data = res.data ?? [];
  return data.map((m) => ({
    id: m.id,
    subject: m.subject,
    intro: m.intro,
    from: m.from,
    createdAt: m.createdAt,
  }));
}

export async function fetchEmailBody(
  email: string,
  messageId: string,
): Promise<{
  subject?: string;
  text?: string;
  intro?: string;
  html?: string[];
}> {
  const mailjs = clients.get(email);
  if (!mailjs) {
    throw new Error("No Mailjs session for this email.");
  }
  const res = await mailjs.getMessage(messageId);
  if (!res.status || !res.data) {
    throw new Error(apiErrorMessage(res, "Mailjs getMessage failed"));
  }
  const d = res.data;
  return {
    subject: d.subject,
    text: d.text,
    intro: (d as { intro?: string }).intro,
    html: d.html,
  };
}

function extractVerificationCode(text: string): string | null {
  if (!text) return null;
  const match = text.match(/\b\d{6}\b/);
  return match?.[0] ?? null;
}

export async function waitForVerificationCode(
  email: string,
  options?: { timeoutMs?: number; pollIntervalMs?: number },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 4_000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const messages = await fetchMailMessages(email);
      if (messages?.length) {
        const latest = messages[0];
        const full = await fetchEmailBody(email, latest.id);
        const text = [full.text, full.intro, full.subject]
          .filter(Boolean)
          .join(" ");
        const code = extractVerificationCode(text);
        if (code) return code;
      }
    } catch (err) {
      console.warn("Mailjs poll error:", err);
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error("Verification email timeout");
}

export function disposeMailClient(email: string): void {
  const client = clients.get(email);
  if (client) {
    try { client.off(); } catch {}
    clients.delete(email);
  }
}

function randomSuffix(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < length; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

function generatePassword(length = 16): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let s = "";
  for (let i = 0; i < length; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}
