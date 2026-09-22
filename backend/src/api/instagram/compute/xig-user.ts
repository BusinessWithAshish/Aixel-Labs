import type { CountryCode } from "libphonenumber-js";

import { IG_ACCOUNT_TYPE } from "../constants";
import { instagramProfileUrl } from "./username";
import { collectBusinessPhoneNumbers } from "./phones";
import type { INSTAGRAM_RESPONSE } from "../types";

/**
 * `xig_user_by_username` from the logged-out profile GraphQL query: bio,
 * links and counts, but no business block and no post count
 * (`all_media_count` is always null to guests).
 *
 * Only the fields we read are typed.
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
  all_media_count: number | null;
  bio_links: Array<{
    url?: string;
    lynx_url?: string;
    link_type?: string;
  }>;
  pronouns?: string[];
};

/**
 * `user` from the profile page query — the business half guests can still
 * read. `category` is "" when the owner hides it; `address_*` and
 * `media_count` come back null to guests (kept for when they don't).
 */
export type XigProfilePageUser = {
  account_type?: number | null;
  category?: string | null;
  hd_profile_pic_url_info?: { url?: string | null } | null;
  address_street?: string | null;
  city_name?: string | null;
  zip?: string | null;
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
 * Phone numbers and emails in bio links — `wa.me` / `api.whatsapp.com`
 * chat links, `tel:` and `mailto:`. WhatsApp links are the most common way a
 * small business publishes its number. WhatsApp numbers are international,
 * so they get a `+` for the phone parser; `tel:` is passed through as written.
 */
function contactsFromLinks(links: string[]): { phones: string[]; emails: string[] } {
  const phones: string[] = [];
  const emails: string[] = [];
  for (const link of links) {
    let u: URL;
    try {
      u = new URL(link);
    } catch {
      continue;
    }
    const host = u.hostname.replace(/^www\./, "");
    if (u.protocol === "mailto:") {
      emails.push(...extractEmailsFromBio(decodeURIComponent(u.pathname)));
    } else if (u.protocol === "tel:") {
      phones.push(decodeURIComponent(u.pathname));
    } else if (host === "wa.me" || host.endsWith("whatsapp.com")) {
      const raw =
        host === "wa.me" ? u.pathname.split("/")[1] : u.searchParams.get("phone");
      const digits = raw?.replace(/\D/g, "") ?? "";
      if (digits.length >= 8) phones.push(`+${digits}`);
    }
  }
  return { phones, emails };
}

/** `business_address_json`'s old shape, when the address is exposed at all. */
function addressJson(page: XigProfilePageUser | null): string | null {
  if (!page?.address_street && !page?.city_name && !page?.zip) return null;
  return JSON.stringify({
    street_address: page.address_street ?? null,
    city_name: page.city_name ?? null,
    zip_code: page.zip ?? null,
  });
}

/**
 * Map `xig_user_by_username` (+ the profile page query's `user` and the embed
 * page's post count, when the client got them) to `INSTAGRAM_RESPONSE`.
 * `account_type` gives isBusiness / isProfessional — the page query's own
 * `is_business` is always false to guests. Emails and phones come from the
 * bio and bio links; the Contact-button fields stay login-only.
 */
export function mapXigUserToResponse(
  user: XigUserByUsername,
  country: CountryCode,
  extra: { page?: XigProfilePageUser | null; posts?: number | null } = {},
): INSTAGRAM_RESPONSE {
  const page = extra.page ?? null;
  const bio = user.biography ?? null;
  const websites: string[] = [];
  for (const link of user.bio_links ?? []) {
    const resolved = unwrapLynxUrl(link.url ?? link.lynx_url);
    if (resolved) websites.push(resolved);
  }

  const linked = contactsFromLinks(websites);
  const emails = [...new Set([...extractEmailsFromBio(bio), ...linked.emails])];
  const phones = collectBusinessPhoneNumbers(
    null,
    [bio ?? "", ...linked.phones].join("\n"),
    country,
  );
  const accountType = page?.account_type ?? null;

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
    posts: extra.posts ?? user.all_media_count ?? null,
    profilePicture: user.profile_pic_url ?? null,
    profilePictureHd: page?.hd_profile_pic_url_info?.url ?? null,
    isVerified: user.is_verified ?? null,
    isBusiness:
      accountType == null ? null : accountType === IG_ACCOUNT_TYPE.BUSINESS,
    isProfessional:
      accountType == null ? null : accountType !== IG_ACCOUNT_TYPE.PERSONAL,
    isPrivate: user.is_private ?? null,
    isJoinedRecently: null,
    businessEmail: emails.length > 0 ? emails[0]! : null,
    businessPhoneNumber: phones,
    businessCategoryName: page?.category || null,
    overallCategoryName: null,
    businessAddressJson: addressJson(page),
  };
}
