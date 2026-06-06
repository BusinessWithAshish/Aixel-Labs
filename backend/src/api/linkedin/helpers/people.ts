import * as cheerio from "cheerio";
import {
  LINKEDIN_BY_PEOPLE_REQUEST,
  LINKEDIN_BY_PEOPLE_RESPONSE,
} from "../types";
import { fetchGSearch } from "../../gsearch/helpers";
import { fetchUrlsImpit } from "../../../utils/impit-session-handler";
import { LINKEDIN_BY_PEOPLE_ADVANCED_SEARCH_QUERY } from "../constants";
import {
  attr,
  canonicalLinkedInProfileUrl,
  extractAllJsonLdNodes,
  extractJsonLdMapped,
  filterJsonLdNodesByType,
  forEachJsonLdRecord,
  isLinkedInMediaSrc,
  isRecord,
  jsonLdTypeMatches,
  ldString,
  linkedInProfileSlugFromUrl,
  normalizeLdDate,
  normalizeStringList,
  parseInteractionLikeCount,
  parseJsonLdImageUrl,
  safeInt,
  txt,
} from "./common";

function normalizeLdPlainText(raw: string | null | undefined): string | null {
  if (raw == null || raw === "") return null;
  const withBreaks = raw.replace(/<br\s*\/?>/gi, "\n");
  const stripped = withBreaks.replace(/<\/?[^>]+>/g, "");
  const cleaned = stripped
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+\n/g, "\n")
    .trim();
  return cleaned || null;
}

type LINKEDIN_PULSE_ARTICLE =
  LINKEDIN_BY_PEOPLE_RESPONSE["pulse_articles"][number];
type LINKEDIN_PUBLICATION = LINKEDIN_BY_PEOPLE_RESPONSE["publications"][number];
type LINKEDIN_RECENT_POST = LINKEDIN_BY_PEOPLE_RESPONSE["recent_posts"][number];

function mapPulseArticleFromJsonLdNode(
  node: Record<string, unknown>,
): LINKEDIN_PULSE_ARTICLE {
  return {
    headline: ldString(node, "headline"),
    url: ldString(node, "url"),
    date_published: normalizeLdDate(node.datePublished),
    date_modified: normalizeLdDate(node.dateModified),
    cover_image_url: parseJsonLdImageUrl(node.image),
    like_count: parseInteractionLikeCount(node.interactionStatistic),
  };
}

export function extractPulseArticlesFromJsonLd(
  nodes: unknown[],
): LINKEDIN_PULSE_ARTICLE[] {
  return extractJsonLdMapped(nodes, "Article", mapPulseArticleFromJsonLdNode, {
    sortByDate: true,
  });
}

function mapPublicationFromJsonLdNode(
  node: Record<string, unknown>,
): LINKEDIN_PUBLICATION {
  return {
    name: ldString(node, "name"),
    url: ldString(node, "url"),
  };
}

export function extractPublicationsFromJsonLd(
  nodes: unknown[],
): LINKEDIN_PUBLICATION[] {
  return extractJsonLdMapped(
    nodes,
    "PublicationIssue",
    mapPublicationFromJsonLdNode,
  );
}

function isLinkedInActivityPostNode(node: Record<string, unknown>): boolean {
  const url = ldString(node, "url");
  return (
    jsonLdTypeMatches(node["@type"], "DiscussionForumPosting") &&
    !!url &&
    url.includes("/posts/")
  );
}

function mapRecentPostFromJsonLdNode(
  node: Record<string, unknown>,
): LINKEDIN_RECENT_POST {
  return {
    headline: ldString(node, "headline"),
    text: ldString(node, "text"),
    url: ldString(node, "url"),
    date_published: normalizeLdDate(node.datePublished),
    like_count: parseInteractionLikeCount(node.interactionStatistic),
    main_entity_url:
      typeof node.mainEntityOfPage === "string" ? node.mainEntityOfPage : null,
  };
}

export function extractRecentPostsFromJsonLd(
  nodes: unknown[],
): LINKEDIN_RECENT_POST[] {
  return extractJsonLdMapped(
    nodes,
    "DiscussionForumPosting",
    mapRecentPostFromJsonLdNode,
    { sortByDate: true, predicate: isLinkedInActivityPostNode },
  );
}

function isEducationalOrganizationEntry(
  entry: Record<string, unknown>,
): boolean {
  const url = ldString(entry, "url") ?? "";
  return (
    jsonLdTypeMatches(entry["@type"], "EducationalOrganization") ||
    url.includes("/school/")
  );
}

type OrgEntryBase = {
  name: string | null;
  url: string | null;
  location: string | null;
  start_date: string | null;
  description: string | null;
  role: string | null;
  end_date: string | null;
};

function mapOrgEntryFromJsonLd(
  entry: Record<string, unknown>,
): OrgEntryBase | null {
  const member = isRecord(entry.member) ? entry.member : undefined;
  const name = ldString(entry, "name");
  const url = ldString(entry, "url");
  if (!name && !url) return null;

  const roleSource = member ?? {};
  return {
    name,
    url,
    location: ldString(entry, "location"),
    start_date: normalizeLdDate(member?.startDate),
    description: normalizeLdPlainText(
      typeof member?.description === "string" ? member.description : null,
    ),
    role: ldString(roleSource, "roleName") ?? ldString(roleSource, "name"),
    end_date: normalizeLdDate(member?.endDate),
  };
}

function mapEducationFromJsonLdEntry(
  entry: Record<string, unknown>,
): LINKEDIN_BY_PEOPLE_RESPONSE["education"][number] | null {
  const base = mapOrgEntryFromJsonLd(entry);
  if (!base) return null;
  const { role, ...rest } = base;
  return { ...rest, degree: role };
}

function mapWorkExperienceFromJsonLdEntry(
  entry: Record<string, unknown>,
): LINKEDIN_BY_PEOPLE_RESPONSE["past_experience"][number] | null {
  const base = mapOrgEntryFromJsonLd(entry);
  if (!base) return null;
  const { role, ...rest } = base;
  return { ...rest, position: role };
}

function normalizePersonJobTitles(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) {
    const titles = raw
      .map((x) => (typeof x === "string" ? x.trim() : null))
      .filter((t): t is string => !!t);
    return titles.length ? titles : null;
  }
  return null;
}

function normalizeLanguagesList(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") out.push(item);
    else if (isRecord(item) && "name" in item) out.push(String(item.name));
  }
  return out.length ? out : null;
}

function pickPrimaryPersonNode(
  nodes: unknown[],
): Record<string, unknown> | null {
  const persons = filterJsonLdNodesByType(nodes, "Person");
  if (!persons.length) return null;

  const hasRichProfile = (p: Record<string, unknown>) =>
    ldString(p, "url")?.includes("/in/") &&
    ((Array.isArray(p.worksFor) && p.worksFor.length > 0) ||
      (Array.isArray(p.alumniOf) && p.alumniOf.length > 0) ||
      (typeof p.description === "string" && p.description.length > 0));

  return (
    persons.find(hasRichProfile) ??
    persons.find((p) => ldString(p, "url")?.includes("/in/")) ??
    persons[0] ??
    null
  );
}

function resolvePersonLinkedInUrl(
  person: Record<string, unknown>,
): string | null {
  const url = ldString(person, "url");
  if (url) return url;
  const sameAs = person.sameAs;
  if (typeof sameAs === "string") return sameAs;
  if (Array.isArray(sameAs) && typeof sameAs[0] === "string") return sameAs[0];
  return null;
}

export function extractPersonProfileFromJsonLd(nodes: unknown[]) {
  const person = pickPrimaryPersonNode(nodes);
  if (!person) {
    return {
      address: { locality: null, country: null },
      job_titles: null,
      languages: null,
      memberOf: null,
      name: null,
      url: null,
      description: null,
      follower_count: null,
      profile_photo_url: null,
      awards: null,
    };
  }

  const addr = isRecord(person.address) ? person.address : undefined;

  return {
    address: {
      locality: ldString(addr ?? {}, "addressLocality"),
      country: ldString(addr ?? {}, "addressCountry"),
    },
    job_titles: normalizePersonJobTitles(person.jobTitle),
    languages: normalizeLanguagesList(person.knowsLanguage),
    memberOf: normalizeStringList(person.memberOf),
    name: ldString(person, "name"),
    url: resolvePersonLinkedInUrl(person),
    description: normalizeLdPlainText(
      typeof person.description === "string" ? person.description : null,
    ),
    follower_count: parseInteractionLikeCount(person.interactionStatistic),
    profile_photo_url: parseJsonLdImageUrl(person.image),
    awards: normalizeStringList(person.awards),
  };
}

export function extractPersonExperienceFromJsonLd(nodes: unknown[]) {
  const person = pickPrimaryPersonNode(nodes);
  const education: LINKEDIN_BY_PEOPLE_RESPONSE["education"] = [];
  const past_experience: LINKEDIN_BY_PEOPLE_RESPONSE["past_experience"] = [];
  const current_experience: LINKEDIN_BY_PEOPLE_RESPONSE["current_experience"] =
    [];

  const routeEntry = (
    entry: Record<string, unknown>,
    target: "alumni" | "worksFor",
  ) => {
    if (isEducationalOrganizationEntry(entry)) {
      const mapped = mapEducationFromJsonLdEntry(entry);
      if (mapped) education.push(mapped);
      return;
    }
    const mapped = mapWorkExperienceFromJsonLdEntry(entry);
    if (!mapped) return;
    if (target === "alumni") past_experience.push(mapped);
    else current_experience.push(mapped);
  };

  forEachJsonLdRecord(person?.alumniOf, (entry) => routeEntry(entry, "alumni"));
  forEachJsonLdRecord(person?.worksFor, (entry) =>
    routeEntry(entry, "worksFor"),
  );

  return { education, past_experience, current_experience };
}

/** Parse labels like "24K followers" or "1M followers" into a number. */
function parseFollowerCountLabel(raw: string | null): number | null {
  if (!raw) return null;
  const match = raw
    .trim()
    .toLowerCase()
    .match(/^([\d,.]+)\s*([km])?\s*followers?/);
  if (!match) return safeInt(raw);
  let n = parseFloat(match[1].replace(/,/g, ""));
  if (Number.isNaN(n)) return null;
  if (match[2] === "k") n *= 1_000;
  else if (match[2] === "m") n *= 1_000_000;
  return Math.round(n);
}

export function extractSimilarProfilesFromHtml(
  $: cheerio.CheerioAPI,
): LINKEDIN_BY_PEOPLE_RESPONSE["similar_profiles"] {
  const similar_profiles: LINKEDIN_BY_PEOPLE_RESPONSE["similar_profiles"] = [];

  $("ul.aside-profiles-list li").each((_, el) => {
    const card = $(el);
    const name = txt(card.find(".base-aside-card__title").first());
    const rawUrl = attr(card.find("a.base-card__full-link").first(), "href");
    const url = rawUrl
      ? (canonicalLinkedInProfileUrl(rawUrl) ?? rawUrl.replace(/\?.*$/, ""))
      : null;

    const imgSrc = attr(
      card
        .find("img.hue-web-entity__image, img[src*='profile-displayphoto']")
        .first(),
      "src",
    );
    const profile_photo_url = isLinkedInMediaSrc(imgSrc, "profile-displayphoto")
      ? imgSrc
      : null;

    const metaDivs = card.find(".base-aside-card__metadata > div");
    const follower_count = parseFollowerCountLabel(txt(metaDivs.eq(0)));
    const location = txt(metaDivs.eq(1));

    if (name && url) {
      similar_profiles.push({
        name,
        url,
        follower_count,
        location,
        profile_photo_url,
      });
    }
  });

  return similar_profiles;
}

function resolveTopCardLinkHref(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim(), "https://www.linkedin.com");
    if (u.pathname.includes("/redir/redirect")) {
      const dest = u.searchParams.get("url");
      return dest ? decodeURIComponent(dest) : null;
    }
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "") || null;
  } catch {
    return raw.trim() || null;
  }
}

export function extractProfileLinksFromHtml(
  $: cheerio.CheerioAPI,
): LINKEDIN_BY_PEOPLE_RESPONSE["profile_links"] {
  const links: string[] = [];

  $(".top-card__links-container a[data-test-id='top-card-link']").each(
    (_, el) => {
      const resolved = resolveTopCardLinkHref(attr($(el), "href"));
      if (resolved) links.push(resolved);
    },
  );

  return links.length ? links : null;
}

export function extractProfileBackgroundUrlFromHtml(
  $: cheerio.CheerioAPI,
): LINKEDIN_BY_PEOPLE_RESPONSE["profile_background_url"] {
  const src = attr(
    $(
      "figure.cover-img img.cover-img__image, img[data-embed-id='cover-image'], img[src*='profile-displaybackgroundimage']",
    ).first(),
    "src",
  );
  return isLinkedInMediaSrc(src, "profile-displaybackgroundimage") ? src : null;
}

export function extractHeadlineFromHtml(
  $: cheerio.CheerioAPI,
): LINKEDIN_BY_PEOPLE_RESPONSE["headline"] {
  return txt($("h2.top-card-layout__headline").first());
}

function resolveProfileSlugFromPage(
  $: cheerio.CheerioAPI,
  profileUrl: string | null,
): string | null {
  const fromUrl = linkedInProfileSlugFromUrl(profileUrl);
  if (fromUrl) return fromUrl;

  const joinHref = attr($('a[href*="vieweeVanityName"]').first(), "href");
  if (joinHref) {
    try {
      return (
        new URL(joinHref, "https://www.linkedin.com").searchParams.get(
          "vieweeVanityName",
        ) ?? null
      );
    } catch {
      // ignore malformed join link
    }
  }

  const sessionRedirect = attr(
    $(
      '.contact-info-modal input[name="session_redirect"], input[name="session_redirect"]',
    ).first(),
    "value",
  );
  return linkedInProfileSlugFromUrl(sessionRedirect);
}

function buildContactInfoOverlayUrl(slug: string): string {
  return `https://www.linkedin.com/in/${slug}/overlay/contact-info/`;
}

function buildDirectMessageUrl(slug: string): string {
  return `https://www.linkedin.com/messaging/compose/?recipient=${encodeURIComponent(slug)}`;
}

export function extractContactInfoUrlFromHtml(
  $: cheerio.CheerioAPI,
  profileUrl: string | null,
): LINKEDIN_BY_PEOPLE_RESPONSE["contact_info_url"] {
  const slug = resolveProfileSlugFromPage($, profileUrl);
  return slug ? buildContactInfoOverlayUrl(slug) : null;
}

export function extractDirectMessageUrlFromHtml(
  $: cheerio.CheerioAPI,
  profileUrl: string | null,
): LINKEDIN_BY_PEOPLE_RESPONSE["direct_message_url"] {
  const composeHref = attr($('a[href*="/messaging/compose/"]').first(), "href");
  if (composeHref) {
    try {
      const u = new URL(composeHref, "https://www.linkedin.com");
      if (!u.searchParams.get("recipient")) {
        const slug = resolveProfileSlugFromPage($, profileUrl);
        if (slug) u.searchParams.set("recipient", slug);
      }
      u.hash = "";
      return u.toString();
    } catch {
      return composeHref;
    }
  }

  const slug = resolveProfileSlugFromPage($, profileUrl);
  return slug ? buildDirectMessageUrl(slug) : null;
}

export function buildLinkedInPeopleSearchQuery(
  body: LINKEDIN_BY_PEOPLE_REQUEST,
): string {
  const {
    country,
    state,
    city,
    name,
    bio,
    job_titles,
    keywords,
    languages,
    companies,
    educations,
  } = body.discovery_filters;

  const orQuoted = (items: string[]) =>
    `(${items.map((item) => `"${item.trim()}"`).join(" OR ")})`;

  const parts = [
    LINKEDIN_BY_PEOPLE_ADVANCED_SEARCH_QUERY.trim(),
    name?.trim() ? `"${name.trim()}"` : undefined,
    bio?.trim() ? `"${bio.trim()}"` : undefined,
    job_titles?.length ? orQuoted(job_titles) : undefined,
    keywords?.length ? orQuoted(keywords) : undefined,
    languages?.length ? orQuoted(languages) : undefined,
    companies?.length ? orQuoted(companies) : undefined,
    educations?.length ? orQuoted(educations) : undefined,
    country,
    city ?? state,
  ];

  return parts.filter(Boolean).join(" ");
}

export const parseLinkedInPeoplePage = (
  html: string,
): LINKEDIN_BY_PEOPLE_RESPONSE => {
  const $ = cheerio.load(html);
  const allJsonLdNodes = extractAllJsonLdNodes($);
  const {
    address,
    job_titles,
    languages,
    memberOf,
    name,
    url,
    description,
    follower_count,
    profile_photo_url,
    awards,
  } = extractPersonProfileFromJsonLd(allJsonLdNodes);
  const { education, past_experience, current_experience } =
    extractPersonExperienceFromJsonLd(allJsonLdNodes);

  const pulse_articles = extractPulseArticlesFromJsonLd(allJsonLdNodes);
  const recent_posts = extractRecentPostsFromJsonLd(allJsonLdNodes);

  return {
    id: linkedInProfileSlugFromUrl(url),
    url,
    name,
    headline: extractHeadlineFromHtml($),
    job_titles,
    description,
    profile_photo_url,
    profile_background_url: extractProfileBackgroundUrlFromHtml($),
    contact_info_url: extractContactInfoUrlFromHtml($, url),
    direct_message_url: extractDirectMessageUrlFromHtml($, url),
    follower_count,
    address,
    languages,
    member_of: memberOf,
    awards,
    education,
    past_experience,
    current_experience,
    pulse_articles,
    publications: extractPublicationsFromJsonLd(allJsonLdNodes),
    recent_posts,
    last_post_date: recent_posts[0]?.date_published ?? null,
    similar_profiles: extractSimilarProfilesFromHtml($),
    profile_links: extractProfileLinksFromHtml($),
  };
};

type YearMonth = { year: number; month: number };

function parseLdYearMonth(value: string | null | undefined): YearMonth | null {
  if (value == null || value === "") return null;
  const match = String(value)
    .trim()
    .match(/^(\d{4})(?:-(\d{1,2}))?/);
  if (!match) return null;
  return { year: Number(match[1]), month: match[2] ? Number(match[2]) : 1 };
}

function isBeforeYearMonth(a: YearMonth, b: YearMonth): boolean {
  return a.year < b.year || (a.year === b.year && a.month < b.month);
}

function monthsBetween(start: YearMonth, end: YearMonth): number {
  return (end.year - start.year) * 12 + (end.month - start.month);
}

function computeTotalExperienceYears(
  person: LINKEDIN_BY_PEOPLE_RESPONSE,
): number | null {
  const roles = [...person.past_experience, ...person.current_experience];
  let earliest: YearMonth | null = null;

  for (const role of roles) {
    const start = parseLdYearMonth(role.start_date);
    if (!start) continue;
    if (!earliest || isBeforeYearMonth(start, earliest)) earliest = start;
  }

  if (!earliest) return null;

  const now = new Date();
  const end = { year: now.getFullYear(), month: now.getMonth() + 1 };
  return Math.max(0, monthsBetween(earliest, end) / 12);
}

function personMatchesIndustryFilter(
  person: LINKEDIN_BY_PEOPLE_RESPONSE,
  industries: string[],
): boolean {
  const haystack = [
    person.headline,
    person.description,
    ...(person.job_titles ?? []),
    ...person.current_experience.flatMap((r) => [
      r.name,
      r.description,
      r.position,
    ]),
  ]
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .join(" ")
    .toLowerCase();

  if (!haystack) return false;

  return industries.some((industry) =>
    haystack.includes(industry.trim().toLowerCase()),
  );
}

function inRange(
  value: number | null | undefined,
  min: number | undefined,
  max: number | undefined,
): boolean {
  if (value == null) return false;
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

function filterLinkedInPeopleByEnrichment(
  people: LINKEDIN_BY_PEOPLE_RESPONSE[],
  enrichment: LINKEDIN_BY_PEOPLE_REQUEST["enrichment"],
): LINKEDIN_BY_PEOPLE_RESPONSE[] {
  const { followers, experience_years, industry } = enrichment || {};

  const hasFollowerFilter =
    followers?.min !== undefined || followers?.max !== undefined;
  const hasExperienceFilter =
    experience_years?.min !== undefined || experience_years?.max !== undefined;
  const hasIndustryFilter = Boolean(industry?.length);

  if (!hasFollowerFilter && !hasExperienceFilter && !hasIndustryFilter) {
    return people;
  }

  return people.filter((person) => {
    if (
      hasFollowerFilter &&
      !inRange(person.follower_count, followers?.min, followers?.max)
    ) {
      return false;
    }

    if (hasExperienceFilter) {
      const totalYears = computeTotalExperienceYears(person);
      if (!inRange(totalYears, experience_years?.min, experience_years?.max)) {
        return false;
      }
    }

    if (hasIndustryFilter && industry?.length) {
      if (!personMatchesIndustryFilter(person, industry)) return false;
    }

    return true;
  });
}

export const fetchLinkedInByPeople = async (
  body: LINKEDIN_BY_PEOPLE_REQUEST,
): Promise<LINKEDIN_BY_PEOPLE_RESPONSE[]> => {
  const { limit, discovery_filters, enrichment } = body;

  const searchQuery = buildLinkedInPeopleSearchQuery(body);
  const pages = Math.ceil(limit / 10);

  console.log(`[LinkedIn] People search query: ${searchQuery}`);

  const serpResults = await fetchGSearch({
    searchQuery,
    pages,
    country: discovery_filters.country,
    city: discovery_filters.city ?? discovery_filters.state,
  });

  const profileUrls = serpResults.flatMap((item) => {
    const u = item?.url?.trim();
    if (!u) return [];
    const canonical = canonicalLinkedInProfileUrl(u);
    return canonical ? [canonical] : [];
  });

  // Use Impit for LinkedIn fetching (more resilient to LinkedIn bot-blocks vs TLS client).
  const linkedInPeopleDataResults =
    await fetchUrlsImpit<LINKEDIN_BY_PEOPLE_RESPONSE>({
      targets: profileUrls,
      mapper: (html) => parseLinkedInPeoplePage(html),
    });

  return filterLinkedInPeopleByEnrichment(
    linkedInPeopleDataResults,
    enrichment,
  );
};
