import * as cheerio from "cheerio";
import { LINKEDIN_SEARCH_TYPE } from "../schemas";
import {
  LINKEDIN_BY_COMPANY_REQUEST,
  LINKEDIN_BY_COMPANY_RESPONSE,
} from "../types";
import { fetchGsearch } from "../../gsearch";
import { GSEARCH_MAX_PAGES, GSEARCH_PAGE_SIZE } from "../../gsearch/constants";
import { fetchUrls } from "../../../utils/node-tls-client-session-handler";
import { LINKEDIN_BY_COMPANY_ADVANCED_SEARCH_QUERY } from "../constants";
import {
  attr,
  extractAllJsonLdNodes,
  filterJsonLdNodesByType,
  isRecord,
  ldString,
  parseJsonLdImageUrl,
  safeInt,
  txt,
} from "./common";

export const parseLinkedInCompanyPage = (
  html: string,
): LINKEDIN_BY_COMPANY_RESPONSE => {
  const $ = cheerio.load(html);

  const allJsonLdNodes = extractAllJsonLdNodes($);
  const meta =
    filterJsonLdNodesByType(allJsonLdNodes, "Organization")[0] ?? null;
  const postNodes = filterJsonLdNodesByType(
    allJsonLdNodes,
    "DiscussionForumPosting",
  );

  // ── JSON-LD fields ─────────────────────────────────────────────────────────
  const metaName = meta ? ldString(meta, "name") : null;
  const metaUrl = meta ? ldString(meta, "url") : null;
  const metaDescription = meta ? ldString(meta, "description") : null;
  const employees =
    meta && isRecord(meta.numberOfEmployees)
      ? meta.numberOfEmployees
      : undefined;
  const metaEmployeeCount: number | null =
    safeInt(String(employees?.value ?? "")) ?? null;
  const logo = meta && isRecord(meta.logo) ? meta.logo : undefined;
  const metaLogoUrl = logo ? parseJsonLdImageUrl(logo) : null;
  const metaLogoDesc = logo ? ldString(logo, "description") : null;
  const metaSameAs = meta ? ldString(meta, "sameAs") : null;

  const addr = meta && isRecord(meta.address) ? meta.address : undefined;
  const metaAddress = {
    locality: addr ? ldString(addr, "addressLocality") : null,
    region: addr ? ldString(addr, "addressRegion") : null,
    country: addr ? ldString(addr, "addressCountry") : null,
    code: addr ? ldString(addr, "postalCode") : null,
  };

  // ── About-us section ───────────────────────────────────────────────────────
  const companyDescription = txt($('p[data-test-id="about-us__description"]'));

  // Website anchor has a redirect URL — extract the display text href instead
  const companyWebsite = attr(
    $('a[data-tracking-control-name="about_website"]'),
    "href",
  );

  // data-test-id is "about-us__size", not "about-us__company-size"
  const companySize = txt($('div[data-test-id="about-us__size"] dd'));

  const companyType = txt(
    $('div[data-test-id="about-us__organizationType"] dd'),
  );

  const companyIndustry = txt($('div[data-test-id="about-us__industry"] dd'));

  const companyHeadquarters = txt(
    $('div[data-test-id="about-us__headquarters"] dd'),
  );

  const companySpecialties = txt(
    $('[data-test-id="about-us__specialties"] dd'),
  );

  // ── Employee count ─────────────────────────────────────────────────────────
  // Prefer JSON-LD; fall back to the face-pile CTA ("Discover all 5,381 employees")
  const employeeCount: number | null = (() => {
    if (metaEmployeeCount !== null) return metaEmployeeCount;

    const facePileText = txt(
      $('[data-test-id="view-all-employees-cta"] .face-pile__text'),
    );
    if (facePileText) return safeInt(facePileText);

    return null;
  })();

  // ── Taglines ───────────────────────────────────────────────────────────────
  // h4.top-card-layout__second-subline holds company tagline(s) e.g.
  // "Transformation Powered by Intelligence"
  const taglines: string[] | null = (() => {
    const items = $("h4.top-card-layout__second-subline")
      .map((_, el) => txt($(el)))
      .get()
      .filter((t): t is string => t !== null);
    return items.length ? items : null;
  })();

  // ── Followers ──────────────────────────────────────────────────────────────
  // Priority 1: h3.top-card-layout__first-subline — "San Francisco, CA · 10,681,746 followers"
  // Priority 2: first post's entity-lockup paragraph — "10,678,656 followers"
  // Priority 3: null
  const followers: number | null = (() => {
    const sublineText = txt($("h3.top-card-layout__first-subline"));
    if (sublineText) {
      const match = sublineText.match(/(\d[\d,]+)\s+followers/i);
      if (match) return safeInt(match[1]);
    }

    const firstPostLockup = $('[data-test-id="updates"] li')
      .first()
      .find('[data-test-id="main-feed-activity-card__entity-lockup"]');

    if (firstPostLockup.length) {
      const followerP = firstPostLockup
        .find("p")
        .filter((_, el) => /followers/i.test($(el).text()))
        .first();
      if (followerP.length) return safeInt(txt(followerP));
    }

    return null;
  })();

  // ── Funding ────────────────────────────────────────────────────────────────
  const fundingInfo = (() => {
    const fundingSection = $('[data-test-id="funding"]').first();
    if (!fundingSection.length) return null;

    // Use data-tracking-control-name — stable LinkedIn attribute, no Crunchbase URL fragility
    const allRoundsAnchor = fundingSection.find(
      'a[data-tracking-control-name="funding_all-rounds"]',
    );
    const total_rounds = safeInt(txt(allRoundsAnchor.find("span").last()));

    const lastRoundAnchor = fundingSection.find(
      'a[data-tracking-control-name="funding_last-round"]',
    );
    const last_round_type = lastRoundAnchor.length
      ? lastRoundAnchor
          .contents()
          .filter((_, node) => node.type === "text")
          .text()
          .replace(/\s+/g, " ")
          .trim() || null
      : null;

    const last_round_date = attr(lastRoundAnchor.find("time"), "datetime");

    // Keep as string — "M"/"B" suffix carries meaning
    const last_round_amount = txt(fundingSection.find(".text-display-lg"));

    const investors: string[] = fundingSection
      .find('a[data-tracking-control-name="funding_investors"]')
      .filter((_, el) => $(el).find("img").length > 0)
      .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean);

    return {
      total_rounds,
      last_round_date,
      last_round_type,
      last_round_amount,
      investors,
    };
  })();

  // ── Similar pages ──────────────────────────────────────────────────────────
  const similarPages: LINKEDIN_BY_COMPANY_RESPONSE["similar_pages"] = [];

  $('[data-test-id="similar-pages"] li').each((_, el) => {
    const anchor = $(el).find("a").first();
    const name = txt($(el).find(".base-aside-card__title"));
    const url = attr(anchor, "href");
    const description = txt($(el).find(".base-aside-card__subtitle").first());
    if (name && url) similarPages.push({ name, description, url });
  });

  // ── Affiliated pages ───────────────────────────────────────────────────────
  const affiliatedPages: LINKEDIN_BY_COMPANY_RESPONSE["affiliated_pages"] = [];

  $('[data-test-id="affiliated-pages"] li').each((_, el) => {
    const anchor = $(el).find("a").first();
    const name = txt($(el).find(".base-aside-card__title"));
    const url = attr(anchor, "href");
    const description = txt($(el).find(".base-aside-card__subtitle").first());
    if (name && url) affiliatedPages.push({ name, description, url });
  });

  // ── Recent posts — scraped from HTML updates section ──────────────────────
  // time is relative ("15h", "2d") since LinkedIn doesn't put datetime on the
  // guest-view time element; last_post_date is sourced from JSON-LD instead.
  const recentPosts: LINKEDIN_BY_COMPANY_RESPONSE["recent_posts"] = [];

  $('[data-test-id="updates"] li').each((_, el) => {
    const container = $(el);

    const url = attr(
      container.find('a[data-id="main-feed-card__full-link"]'),
      "href",
    );

    const timeEl = container.find("time").first();
    const time = attr(timeEl, "datetime") ?? txt(timeEl);

    // data-num-reactions attr is more reliable than parsing the span text
    const reactions = safeInt(
      attr(
        container.find('[data-test-id="social-actions__reactions"]'),
        "data-num-reactions",
      ),
    );

    const comments = safeInt(
      attr(
        container.find('[data-test-id="social-actions__comments"]'),
        "data-num-comments",
      ),
    );

    if (url || time || reactions !== null || comments !== null) {
      recentPosts.push({ time, comments, reactions, url });
    }
  });

  // ── Misc ───────────────────────────────────────────────────────────────────
  // Check both the tab label text ("Jobs") and the href (nav_type_jobs)
  const isHiring = $('[data-test-id="nav-tabs"] a')
    .toArray()
    .some((el) => {
      const $el = $(el);
      return (
        $el.text().toLowerCase().includes("job") ||
        ($el.attr("href") ?? "").includes("jobs")
      );
    });

  const coverPhotoEl = $('[data-embed-id="cover-image"]');
  const coverPhoto =
    attr(coverPhotoEl, "src") ?? attr(coverPhotoEl, "data-delayed-url");

  // ── Derive slug id ─────────────────────────────────────────────────────────
  const id = metaUrl
    ? (metaUrl.split("/").filter(Boolean).pop() ?? null)
    : metaName
      ? metaName.toLowerCase().replace(/\s+/g, "-")
      : null;

  return {
    searchType: LINKEDIN_SEARCH_TYPE.COMPANY,
    id,
    name: metaName,
    url: metaUrl,
    address: metaAddress,
    description: metaDescription ?? companyDescription,
    taglines,
    website: metaSameAs ?? companyWebsite,
    employee_count: employeeCount,
    company_size: companySize,
    logo_url: metaLogoUrl,
    cover_photo: coverPhoto,
    logo_description: metaLogoDesc,
    headquaters: companyHeadquarters,
    industry: companyIndustry,
    company_type: companyType,
    specialties: companySpecialties,
    followers,
    funding_info: fundingInfo,
    is_hiring: isHiring,
    similar_pages: similarPages,
    affiliated_pages: affiliatedPages,
    recent_posts: recentPosts,
    last_post_date: (postNodes[0]?.datePublished as string) || null,
  };
};

function hasFiniteBound(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasRangeBounds(range?: { min?: number; max?: number }): boolean {
  // Empty `{}` and cleared number inputs (`NaN`) must not activate filters.
  return hasFiniteBound(range?.min) || hasFiniteBound(range?.max);
}

function filterLinkedInCompaniesByEnrichment(
  companies: LINKEDIN_BY_COMPANY_RESPONSE[],
  enrichment: LINKEDIN_BY_COMPANY_REQUEST["enrichment"],
): LINKEDIN_BY_COMPANY_RESPONSE[] {
  const {
    employee_count,
    funding,
    is_hiring,
    recently_funded,
    follower_count,
    description_include,
    description_exclude,
  } = enrichment || {};

  // Empty `{}` from form defaults is truthy — only treat ranges as active when
  // min/max are actually set (same pattern as people enrichment).
  const hasEmployeeCountFilter = hasRangeBounds(employee_count);
  const hasFundingFilter = hasRangeBounds(funding);
  const hasFollowerCountFilter = hasRangeBounds(follower_count);
  const hasDescriptionInclude = Boolean(description_include?.length);
  const hasDescriptionExclude = Boolean(description_exclude?.length);
  // Form switches write `false` when turned off. Labels are "only if …", so
  // only `true` activates the filter — `false`/`undefined` means no filter.
  const requireHiring = is_hiring === true;
  const requireRecentlyFunded = recently_funded === true;

  if (
    !hasEmployeeCountFilter &&
    !hasFundingFilter &&
    !hasFollowerCountFilter &&
    !hasDescriptionInclude &&
    !hasDescriptionExclude &&
    !requireHiring &&
    !requireRecentlyFunded
  ) {
    return companies;
  }

  return companies.filter((item) => {
    if (hasEmployeeCountFilter) {
      const min = hasFiniteBound(employee_count?.min)
        ? employee_count.min
        : undefined;
      const max = hasFiniteBound(employee_count?.max)
        ? employee_count.max
        : undefined;
      if (item.employee_count === null) return false;
      if (min !== undefined && item.employee_count < min) return false;
      if (max !== undefined && item.employee_count > max) return false;
    }

    // Funding amount bounds are not yet applied (schema has min/max USD; parser
    // only exposes round metadata). Presence of a funding section is the signal.
    if (hasFundingFilter && !item.funding_info) return false;

    if (requireHiring && item.is_hiring !== true) return false;

    if (requireRecentlyFunded && !item.funding_info) return false;

    if (hasFollowerCountFilter) {
      const min = hasFiniteBound(follower_count?.min)
        ? follower_count.min
        : undefined;
      const max = hasFiniteBound(follower_count?.max)
        ? follower_count.max
        : undefined;
      if (item.followers === null) return false;
      if (min !== undefined && item.followers < min) return false;
      if (max !== undefined && item.followers > max) return false;
    }

    if (hasDescriptionInclude) {
      if (!item.description) return false;
      const desc = item.description.toLowerCase();
      if (!description_include!.some((kw) => desc.includes(kw.toLowerCase())))
        return false;
    }

    if (hasDescriptionExclude && item.description) {
      const desc = item.description.toLowerCase();
      if (description_exclude!.every((kw) => desc.includes(kw.toLowerCase())))
        return false;
    }

    return true;
  });
}

export const fetchLinkedInByCompany = async (
  body: LINKEDIN_BY_COMPANY_REQUEST,
): Promise<LINKEDIN_BY_COMPANY_RESPONSE[]> => {
  const { discovery_filters, enrichment, limit } = body;
  const {
    country,
    state,
    city,
    company_name,
    industry,
    keywords,
    company_size,
    type,
    specialties,
  } = discovery_filters;

  const parts = [
    company_name?.trim() ? `"${company_name.trim()}"` : undefined,
    industry?.length
      ? `(${industry.map((i) => `"${i}"`).join(" OR ")})`
      : undefined,
    keywords?.length
      ? `(${keywords.map((k) => `"${k}"`).join(" OR ")})`
      : undefined,
    company_size,
    type,
    specialties?.length
      ? `(${specialties.map((s) => `"${s}"`).join(" OR ")})`
      : undefined,
  ].filter(Boolean);

  const searchQuery = `${LINKEDIN_BY_COMPANY_ADVANCED_SEARCH_QUERY} ${parts.join(" ")}`;

  const pages = Math.min(
    Math.ceil(limit / GSEARCH_PAGE_SIZE),
    GSEARCH_MAX_PAGES,
  );

  console.log(`[LinkedIn] Search query: ${searchQuery}`);

  const { results: searchResults } = await fetchGsearch({
    searchQuery,
    pages,
    country,
    region: city,
    state,
  });

  const companyUrls = searchResults.flatMap((item) =>
    item?.url?.trim() ? [item.url.trim()] : [],
  );

  const linkedInCompanyDataResults =
    await fetchUrls<LINKEDIN_BY_COMPANY_RESPONSE>({
      targets: companyUrls,
      mapper: (html) => parseLinkedInCompanyPage(html),
    });

  const filtered = filterLinkedInCompaniesByEnrichment(
    linkedInCompanyDataResults,
    enrichment,
  );

  console.log(
    `[LinkedIn] Company scrape: ${linkedInCompanyDataResults.length} fetched, ${filtered.length} after enrichment`,
  );

  return filtered;
};
