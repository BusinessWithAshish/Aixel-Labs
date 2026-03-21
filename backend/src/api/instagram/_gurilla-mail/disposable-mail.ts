const API_URL = "http://api.guerrillamail.com/ajax.php";

const sessionStore = new Map<string, string>();

type GMResponse<T = any> = T & {
  email_addr?: string;
  list?: any[];
};

function getAgent() {
  return "my-app";
}

function getIP() {
  return "127.0.0.1";
}

async function gmRequest<T = any>(
  params: Record<string, string | number>,
  sessionId?: string,
): Promise<{ data: GMResponse<T>; sessionId?: string }> {
  const url = new URL(API_URL);

  Object.entries({
    ...params,
    ip: getIP(),
    agent: getAgent(),
  }).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  const res = await fetch(url.toString(), {
    headers: sessionId
      ? {
          Cookie: `PHPSESSID=${sessionId}`,
        }
      : undefined,
  });

  if (!res.ok) {
    throw new Error(`GuerrillaMail API error: ${res.status}`);
  }

  const setCookie = res.headers.get("set-cookie");
  let newSession = sessionId;

  if (setCookie) {
    const match = setCookie.match(/PHPSESSID=([^;]+)/);
    if (match) newSession = match[1];
  }

  const json = await res.json();

  return {
    data: json,
    sessionId: newSession,
  };
}

export async function createMail(username: string): Promise<string> {
  if (!username) throw new Error("username required");

  const init = await gmRequest({ f: "get_email_address", lang: "en" });

  if (!init.sessionId) {
    throw new Error("Failed to obtain session");
  }

  const setUser = await gmRequest(
    {
      f: "set_email_user",
      email_user: username,
      lang: "en",
    },
    init.sessionId,
  );

  if (!setUser.data.email_addr) {
    throw new Error("Failed to create email address");
  }

  const email = setUser.data.email_addr;

  sessionStore.set(email, setUser.sessionId!);

  return email;
}

export async function fetchMailMessages(email: string) {
  const sessionId = sessionStore.get(email);

  if (!sessionId) {
    throw new Error(
      "No session found for this email. Create it using createMail() first.",
    );
  }

  const res = await gmRequest(
    {
      f: "check_email",
      seq: 0,
    },
    sessionId,
  );

  return res.data.list ?? [];
}

export async function fetchEmailBody(email: string, mailId: string | number) {
  const sessionId = sessionStore.get(email);

  if (!sessionId) {
    throw new Error("No session found for this email.");
  }

  const res = await gmRequest(
    {
      f: "fetch_email",
      email_id: mailId,
    },
    sessionId,
  );

  return res.data;
}

function extractVerificationCode(text: string): string | null {
  if (!text) return null;
  const match = text.match(/\b\d{6}\b/);
  return match?.[0] ?? null;
}

export async function waitForVerificationCode(
  email: string,
  options?: {
    timeoutMs?: number;
    pollIntervalMs?: number;
  },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 120000;
  const pollIntervalMs = options?.pollIntervalMs ?? 4000;

  const start = Date.now();

  console.log("Waiting for Instagram verification email...");

  while (Date.now() - start < timeoutMs) {
    try {
      const messages = await fetchMailMessages(email);

      if (messages?.length) {
        const latest = messages[0];

        console.log("Mail received:", latest.mail_subject);

        const mail = await fetchEmailBody(email, latest.mail_id);

        const text =
          mail.mail_body || mail.mail_excerpt || mail.mail_subject || "";

        const code = extractVerificationCode(text);

        if (code) {
          console.log("Verification code found:", code);
          return code;
        }
      }
    } catch (err) {
      console.log("Polling error:", err);
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error("Verification email timeout");
}
