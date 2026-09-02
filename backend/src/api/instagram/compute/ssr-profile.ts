import type { CountryCode } from "libphonenumber-js";

import { instagramProfileUrl } from "./username";
import { collectBusinessPhoneNumbers } from "./phones";
import type { INSTAGRAM_RESPONSE } from "../types";

/**
 * The `xig_user_by_username` blob Instagram's SSR HTML ships to logged-out
 * guests. This is a SUBSET of `web_profile_info`'s `data.user` — Instagram
 * does NOT ship the business contact block (`business_category_name`,
 * `business_email`, `business_phone_number`, `is_business_account`, …) to
 * logged-out readers, so those fields are absent here and map to `null`.
 *
 * Field shape captured from a live `www.instagram.com/{username}/` SSR
 * response (Sep 2026); only the fields we read are typed.
 */
export type XigUserByUsername = {
  pk: string;
  id: string;
  username: string;
  full_name: string;
  biography: string;
  profile_pic_url: string;
  is_verified: boolean;
  is_private: boolean;
  follower_count: number;
  following_count: number;
  all_media_count: number;
  bio_links: Array<{
    url?: string;
    lynx_url?: string;
    link_type?: string;
  }>;
  pronouns?: string[];
};

/** Email regex — deliberately simple; validated against the bio text. */
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export function extractEmailsFromBio(bio: string | null | undefined): string[] {
  if (!bio) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of bio.matchAll(EMAIL_RE)) {
    const e = m[0].toLowerCase();
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

const HASHTAG_RE = /#([a-zA-Z0-9_]+)/g;
// Negative lookbehind: only match `@` NOT preceded by a word char or dot, so
// the domain part of an email like `orders@testbiz.com` isn't treated as a
// mention. Instagram mentions are `@username` preceded by whitespace/start.
const MENTION_RE = /(?<![\w.])@([a-zA-Z0-9._]+)/g;

function extractHashtags(bio: string | null | undefined): string[] {
  if (!bio) return [];
  const out: string[] = [];
  for (const m of bio.matchAll(HASHTAG_RE)) out.push(m[1]);
  return out;
}

function extractMentions(bio: string | null | undefined): string[] {
  if (!bio) return [];
  const out: string[] = [];
  for (const m of bio.matchAll(MENTION_RE)) out.push(m[1]);
  return out;
}

/**
 * Unwrap an Instagram `l.instagram.com/?u=<url>` redirect wrapper to the real
 * destination URL. Returns the input unchanged if it isn't a lynx wrapper.
 */
function unwrapLynxUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  if (!raw.includes("l.instagram.com")) return raw;
  try {
    const u = new URL(raw);
    const inner = u.searchParams.get("u");
    return inner ?? raw;
  } catch {
    return raw;
  }
}

/**
 * Extract the `xig_user_by_username` JSON object from a profile page's SSR
 * HTML by locating `"xig_user_by_username":{` and balance-matching braces.
 * Returns `null` if the blob isn't present (e.g. the page redirected to a
 * login wall or the SSR shape changed).
 */
export function extractSsrUserFromHtml(html: string): XigUserByUsername | null {
  const needle = `"xig_user_by_username":`;
  const startIdx = html.indexOf(needle);
  if (startIdx < 0) return null;
  let i = html.indexOf("{", startIdx + needle.length);
  if (i < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  const begin = i;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(begin, i + 1)) as XigUserByUsername;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Map an SSR `xig_user_by_username` blob to the same `INSTAGRAM_RESPONSE`
 * shape `web_profile_info` produces. Business-category / business-email /
 * business-phone fields that Instagram only ships to logged-in (or trusted-IP)
 * callers come back `null` here; emails/phones found in the public `biography`
 * are still extracted so the lead isn't empty on flagged IPs.
 */
export function mapSsrUserToResponse(
  user: XigUserByUsername,
  country: CountryCode,
): INSTAGRAM_RESPONSE {
  const bio = user.biography ?? null;
  const websites: string[] = [];
  for (const link of user.bio_links ?? []) {
    const resolved = unwrapLynxUrl(link.url ?? link.lynx_url);
    if (resolved) websites.push(resolved);
  }

  const emails = extractEmailsFromBio(bio);
  const phones = collectBusinessPhoneNumbers(null, bio, country);

  return {
    id: user.pk ?? user.id ?? null,
    fullName: user.full_name ?? null,
    username: user.username ?? null,
    instagramUrl: user.username ? instagramProfileUrl(user.username) : null,
    websites: websites.length > 0 ? websites : null,
    bio,
    bioHashtags: (() => {
      const h = extractHashtags(bio);
      return h.length > 0 ? h : null;
    })(),
    bioMentions: (() => {
      const m = extractMentions(bio);
      return m.length > 0 ? m : null;
    })(),
    followers: user.follower_count ?? null,
    following: user.following_count ?? null,
    posts: user.all_media_count ?? null,
    profilePicture: user.profile_pic_url ?? null,
    profilePictureHd: null,
    isVerified: user.is_verified ?? null,
    isBusiness: null,
    isProfessional: null,
    isPrivate: user.is_private ?? null,
    isJoinedRecently: null,
    businessEmail: emails.length > 0 ? emails[0]! : null,
    businessPhoneNumber: phones,
    businessCategoryName: null,
    overallCategoryName: null,
    businessAddressJson: null,
  };
}

/**
 * Parse + map in one step. Returns `null` (does not throw) when the SSR blob
 * is missing — this is the fallback path, so a missing blob should signal
 * "retry" to the caller, not bubble an error up to the handler. Contrast
 * `mapInstagramWebProfileBody`, which throws because it's the primary path.
 */
export function mapSsrProfileHtml(
  html: string,
  country: CountryCode,
): INSTAGRAM_RESPONSE | null {
  const user = extractSsrUserFromHtml(html);
  if (!user) return null;
  return mapSsrUserToResponse(user, country);
}
