const BASE_URL = "http://api.guerrillamail.com/ajax.php";
const DEFAULT_AGENT = "AixelLabsBackend/1.0";
const DEFAULT_IP = "127.0.0.1";

type GetEmailAddressResponse = {
  email_addr: string;
  email_timestamp: number;
  sid_token?: string;
  s_active?: string;
  s_time_expires?: number;
};

type GuerrillaMailListItem = {
  mail_id: string;
  mail_from: string;
  mail_subject: string;
  mail_excerpt: string;
  mail_timestamp: number;
  mail_read: number;
  mail_date: string;
};

type CheckEmailResponse = {
  list: GuerrillaMailListItem[];
  count: number;
  email: string;
  ts: number;
  s_active: string;
};

type FetchEmailResponse = {
  mail_id: string;
  mail_from: string;
  mail_subject: string;
  mail_excerpt: string;
  mail_timestamp: number;
  mail_date: string;
  mail_body: string;
  mail_text?: string;
};

export type GuerrillaMailSession = {
  /** Random email address for this temporary inbox */
  email: string;
  /** Unix timestamp when the email was created */
  emailTimestamp: number;
  /**
   * Raw Cookie header value that must be sent on subsequent requests
   * to keep using the same inbox.
   */
  cookieHeader: string;
};

export type GuerrillaMailMessage = {
  id: string;
  from: string;
  subject: string;
  excerpt: string;
  timestamp: number;
  date: string;
};

async function callGuerrilla<TResponse>(
  params: Record<string, string>,
  cookieHeader?: string,
): Promise<{ data: TResponse; cookieHeader?: string }> {
  const url = new URL(BASE_URL);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  // Required by the Guerrilla Mail API
  url.searchParams.set("ip", DEFAULT_IP);
  url.searchParams.set("agent", DEFAULT_AGENT);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
  });

  if (!res.ok) {
    throw new Error(
      `Guerrilla Mail HTTP error ${res.status}: ${res.statusText}`,
    );
  }

  // Node's fetch exposes getSetCookie for multiple cookies; fall back gracefully.
  const anyHeaders: any = res.headers as any;
  const setCookieArray: string[] | undefined = anyHeaders.getSetCookie
    ? anyHeaders.getSetCookie()
    : res.headers.get("set-cookie")
      ? [res.headers.get("set-cookie") as string]
      : undefined;

  let nextCookieHeader: string | undefined = cookieHeader;

  if (!nextCookieHeader && setCookieArray && setCookieArray.length > 0) {
    // Turn ["PHPSESSID=...; Path=/; HttpOnly", "SUBSCR=...; Path=/"] into
    // "PHPSESSID=...; SUBSCR=..."
    nextCookieHeader = setCookieArray
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
  }

  const data = (await res.json()) as TResponse;

  return { data, cookieHeader: nextCookieHeader };
}

/**
 * Create a new random Guerrilla Mail inbox.
 *
 * This initializes a session and returns the email address plus a cookie
 * header string that must be reused for subsequent API calls.
 */
export async function createGuerrillaInbox(): Promise<GuerrillaMailSession> {
  const { data, cookieHeader } = await callGuerrilla<GetEmailAddressResponse>({
    f: "get_email_address",
    lang: "en",
  });

  if (!cookieHeader) {
    throw new Error("Failed to obtain Guerrilla Mail session cookies");
  }

  return {
    email: data.email_addr,
    emailTimestamp: data.email_timestamp,
    cookieHeader,
  };
}

/**
 * Fetch the newest messages for the given inbox.
 * By default, seq=0 so Guerrilla Mail returns the latest emails.
 */
export async function getLatestMessages(
  session: GuerrillaMailSession,
  seq = 0,
): Promise<GuerrillaMailMessage[]> {
  const { data } = await callGuerrilla<CheckEmailResponse>(
    {
      f: "check_email",
      seq: String(seq),
    },
    session.cookieHeader,
  );

  console.log("[Guerrilla] check_email response", {
    email: data.email,
    count: data.count,
    listLength: data.list?.length ?? 0,
  });

  if (!data.list || data.list.length === 0) {
    return [];
  }

  return data.list
    .slice()
    .sort((a, b) => b.mail_timestamp - a.mail_timestamp)
    .map((m) => ({
      id: m.mail_id,
      from: m.mail_from,
      subject: m.mail_subject,
      excerpt: m.mail_excerpt,
      timestamp: m.mail_timestamp,
      date: m.mail_date,
    }));
}

/**
 * Fetch the full contents of a specific email by id.
 */
export async function fetchEmailById(
  session: GuerrillaMailSession,
  emailId: string,
): Promise<FetchEmailResponse> {
  const { data } = await callGuerrilla<FetchEmailResponse>(
    {
      f: "fetch_email",
      email_id: emailId,
    },
    session.cookieHeader,
  );

  return data;
}

/**
 * Convenience helper: poll Guerrilla Mail for a verification email and
 * extract a numeric code using the provided regex.
 *
 * Returns `null` if no email with a matching code arrives before timeoutMs.
 */
export async function waitForVerificationCode(options: {
  session: GuerrillaMailSession;
  timeoutMs?: number;
  pollIntervalMs?: number;
  codeRegex?: RegExp;
}): Promise<{ code: string; emailId: string } | null> {
  const {
    session,
    timeoutMs = 60_000,
    pollIntervalMs = 5_000,
    codeRegex = /\b(\d{6})\b/,
  } = options;

  const started = Date.now();

  console.log("[Guerrilla] Waiting for verification code", {
    email: session.email,
    timeoutMs,
    pollIntervalMs,
    codeRegex: String(codeRegex),
  });

  // Simple polling loop; for production you may want to externalize this
  // so you don't block a long-running HTTP request.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const elapsed = Date.now() - started;
    if (elapsed > timeoutMs) {
      console.warn("[Guerrilla] Timeout waiting for verification code", {
        email: session.email,
        elapsedMs: elapsed,
      });
      return null;
    }

    const messages = await getLatestMessages(session);

    console.log("[Guerrilla] Poll result", {
      email: session.email,
      elapsedMs: elapsed,
      messageCount: messages.length,
      subjects: messages.map((m) => ({
        id: m.id,
        from: m.from,
        subject: m.subject,
        date: m.date,
      })),
    });

    // Check each message (newest first) for a matching code
    for (const msg of messages) {
      console.log("[Guerrilla] Fetching email body", {
        email: session.email,
        mailId: msg.id,
        subject: msg.subject,
        from: msg.from,
      });

      const full = await fetchEmailById(session, msg.id);
      const body = full.mail_text ?? full.mail_body ?? "";

      console.log("[Guerrilla] Email body sample", {
        email: session.email,
        mailId: msg.id,
        length: body.length,
        sample: body.slice(0, 200),
      });

      const match = body.match(codeRegex);

      if (match && match[1]) {
        console.log("[Guerrilla] Verification code found", {
          email: session.email,
          mailId: msg.id,
          code: match[1],
        });
        return { code: match[1], emailId: msg.id };
      } else {
        console.log("[Guerrilla] No matching code in email", {
          email: session.email,
          mailId: msg.id,
        });
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
