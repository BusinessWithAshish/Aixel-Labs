import { GMAPS } from "../../internal/constants";
import {
  GMAPS_DETAILS_FIELDS,
  GMAPS_DETAILS_SOURCE,
} from "../constants";
import type {
  GMAPS_DETAILS_RESPONSE,
  GmapsAddressComponents,
  GmapsDetailsCommon,
  GmapsDetailsRichness,
  GmapsExternalLink,
  GmapsReviewSnippet,
  GmapsReviewTopic,
} from "../types";
import { mapAttributes, parseAttributes } from "./map-attributes";
import { mapOpenStatus, mapOpeningHours } from "./map-hours";
import { mapPopularTimes } from "./map-popular-times";
import {
  asNumber,
  asString,
  asStringArray,
  collectPhotoUrls,
  dig,
  extractPlaceObject,
  extractRating,
  extractReviewCount,
} from "./parse-place";
import { extractTypeIds, resolveByTypeGroups } from "./resolve-groups";

/** Drop profile/avatar thumbs (s44) — keep place gallery URLs. */
function isLikelyPlacePhoto(url: string): boolean {
  if (/\/s44[-/]/.test(url)) return false;
  if (url.includes("/AAAAAAAAAAI/AAAAAAAAAAA/")) return false;
  return true;
}

function mapAddressComponents(p: unknown[]): GmapsAddressComponents | null {
  const block = p[GMAPS_DETAILS_FIELDS.ADDRESS_BLOCK];
  if (!Array.isArray(block) || !Array.isArray(block[1])) return null;
  const a = block[1] as unknown[];
  const floorArr = Array.isArray(a[7]) ? a[7] : null;
  return {
    neighborhood: asString(a[0]),
    street: asString(a[1]) ?? asString(a[2]),
    city: asString(a[3]),
    postalCode: asString(a[4]),
    state: asString(a[5]),
    country: asString(a[6]),
    floor: floorArr ? asString(floorArr[0]) : null,
  };
}

function mapPlusCodes(p: unknown[]): {
  plusCode: string | null;
  plusCodeGlobal: string | null;
} {
  const block = p[GMAPS_DETAILS_FIELDS.ADDRESS_BLOCK];
  if (!Array.isArray(block) || !Array.isArray(block[2])) {
    return { plusCode: null, plusCodeGlobal: null };
  }
  const c = block[2] as unknown[];
  const global = Array.isArray(c[0]) ? asString(c[0][0]) : asString(c[0]);
  const local = Array.isArray(c[2]) ? asString(c[2][0]) : asString(c[2]);
  return {
    plusCode: local ?? global,
    plusCodeGlobal: global,
  };
}

function mapEditorial(p: unknown[]): {
  editorialTitle: string | null;
  editorialSummary: string | null;
} {
  const ed = p[GMAPS_DETAILS_FIELDS.EDITORIAL];
  if (!Array.isArray(ed)) return { editorialTitle: null, editorialSummary: null };
  const title = Array.isArray(ed[0]) ? asString(ed[0][1]) : null;
  const summary = Array.isArray(ed[1]) ? asString(ed[1][1]) : null;
  return { editorialTitle: title, editorialSummary: summary };
}

function mapExternalLinks(raw: unknown): GmapsExternalLink[] {
  if (!Array.isArray(raw)) return [];
  const out: GmapsExternalLink[] = [];
  for (const row of raw) {
    if (!Array.isArray(row)) continue;
    const url = asString(row[0]);
    if (!url?.startsWith("http")) continue;
    out.push({ url, domain: asString(row[1]) });
  }
  return out;
}

function mapOrderLinks(p: unknown[]): GmapsExternalLink[] {
  const block = p[GMAPS_DETAILS_FIELDS.ORDER_LINKS];
  if (!Array.isArray(block)) return [];
  const out: GmapsExternalLink[] = [];
  const walk = (node: unknown) => {
    if (!Array.isArray(node)) return;
    const url = node.find(
      (x): x is string => typeof x === "string" && x.startsWith("http"),
    );
    const domain = node.find(
      (x): x is string =>
        typeof x === "string" &&
        x.includes(".") &&
        !x.startsWith("http") &&
        x.length < 60,
    );
    if (url && !out.some((l) => l.url === url)) {
      out.push({ url, domain: domain ?? null });
    }
    for (const c of node) {
      if (Array.isArray(c)) walk(c);
    }
  };
  walk(block);
  return out;
}

function mapReviewTopics(p: unknown[]): GmapsReviewTopic[] {
  const block = p[GMAPS_DETAILS_FIELDS.REVIEW_TOPICS];
  if (!Array.isArray(block) || !Array.isArray(block[0])) return [];
  const out: GmapsReviewTopic[] = [];
  for (const row of block[0] as unknown[]) {
    if (!Array.isArray(row)) continue;
    const idRaw = row[0];
    const id = Array.isArray(idRaw)
      ? asString(idRaw[0])
      : asString(idRaw);
    const topic = asString(row[1]);
    if (topic) out.push({ id, topic });
  }
  return out;
}

function mapReviewSnippets(p: unknown[]): GmapsReviewSnippet[] {
  const block = p[GMAPS_DETAILS_FIELDS.REVIEW_SNIPPETS];
  if (!Array.isArray(block) || !Array.isArray(block[1])) return [];
  const out: GmapsReviewSnippet[] = [];
  for (const row of block[1] as unknown[]) {
    if (!Array.isArray(row)) continue;
    let text: string | null = null;
    let authorUrl: string | null = null;
    for (const cell of row) {
      if (typeof cell === "string") {
        if (cell.includes("maps/contrib")) authorUrl = cell.startsWith("http")
          ? cell
          : `https:${cell}`;
        else if (
          (cell.startsWith('"') || cell.length > 20) &&
          !cell.startsWith("http") &&
          !cell.startsWith("//") &&
          !cell.startsWith("0ah") &&
          !cell.startsWith("Ch") &&
          !/^\d+$/.test(cell)
        ) {
          text = cell.replace(/^"|"$/g, "");
        }
      }
    }
    if (text) out.push({ text, authorUrl });
  }
  return out;
}

function mapReviewHistogram(p: unknown[]): number[] | null {
  const block = p[GMAPS_DETAILS_FIELDS.REVIEW_HISTOGRAM];
  if (!Array.isArray(block)) return null;
  const hist = block[3];
  if (!Array.isArray(hist) || hist.length < 5) return null;
  if (!hist.every((n) => typeof n === "number")) return null;
  return hist as number[];
}

function mapCid(p: unknown[]): string | null {
  const bundle = p[GMAPS_DETAILS_FIELDS.ID_BUNDLE];
  if (Array.isArray(bundle) && Array.isArray(bundle[0])) {
    const cid = asString(bundle[0][5]);
    if (cid) return cid;
  }
  const block = p[GMAPS_DETAILS_FIELDS.CID_BLOCK];
  if (Array.isArray(block)) return asString(block[5]);
  return null;
}

function mapOwner(p: unknown[]): { ownerName: string | null; ownerId: string | null } {
  const o = p[GMAPS_DETAILS_FIELDS.OWNER];
  if (!Array.isArray(o)) return { ownerName: null, ownerId: null };
  return {
    ownerName: asString(o[1]),
    ownerId: asString(o[2]) ?? asString(o[8]),
  };
}

export function mapCommon(
  p: unknown[],
  attrMapped: ReturnType<typeof mapAttributes>,
): GmapsDetailsCommon {
  const { primaryType, types } = extractTypeIds(p);
  const p4 = p[GMAPS_DETAILS_FIELDS.RATING_BLOCK];
  const priceText =
    Array.isArray(p4) ? asString(p4[GMAPS_DETAILS_FIELDS.PRICE_TEXT]) : null;
  const priceRange =
    Array.isArray(p4) ? asString(p4[GMAPS_DETAILS_FIELDS.PRICE_RANGE]) : null;
  const { plusCode, plusCodeGlobal } = mapPlusCodes(p);
  const { editorialTitle, editorialSummary } = mapEditorial(p);
  const dwellBlock = p[GMAPS_DETAILS_FIELDS.DWELL];
  const dwellTime = Array.isArray(dwellBlock)
    ? asString(dwellBlock[0])
    : null;
  const { ownerName, ownerId } = mapOwner(p);

  const photos = [
    ...collectPhotoUrls(p[GMAPS_DETAILS_FIELDS.PHOTOS_A]),
    ...collectPhotoUrls(p[GMAPS_DETAILS_FIELDS.PHOTOS_B]),
    ...collectPhotoUrls(p[37]),
  ];
  const thumb = asString(p[157]);
  if (thumb && isLikelyPlacePhoto(thumb)) photos.unshift(thumb);
  const uniquePhotos = photos
    .filter(isLikelyPlacePhoto)
    .filter((u, i, arr) => arr.indexOf(u) === i);

  const reservations = mapExternalLinks(
    p[GMAPS_DETAILS_FIELDS.RESERVATIONS],
  );
  const orderLinks = mapOrderLinks(p);

  return {
    primaryType,
    types,
    priceText,
    priceRange,
    timezone: asString(p[GMAPS_DETAILS_FIELDS.TIMEZONE]),
    countryCode: asString(p[GMAPS_DETAILS_FIELDS.COUNTRY]),
    neighborhood: asString(p[GMAPS_DETAILS_FIELDS.NEIGHBORHOOD]),
    cityRegion: asString(p[GMAPS_DETAILS_FIELDS.CITY_REGION]),
    plusCode,
    plusCodeGlobal,
    addressComponents: mapAddressComponents(p),
    editorialTitle,
    editorialSummary,
    dwellTime,
    openStatus: mapOpenStatus(p),
    openingHours: mapOpeningHours(p),
    popularTimes: mapPopularTimes(p),
    accessibility: attrMapped.accessibility,
    parking: attrMapped.parking,
    payment: attrMapped.payment,
    serviceOptions: attrMapped.serviceOptions,
    otherAttributes: attrMapped.otherAttributes,
    reservations,
    orderLinks,
    photos: uniquePhotos,
    reviewHistogram: mapReviewHistogram(p),
    reviewTopics: mapReviewTopics(p),
    reviewSnippets: mapReviewSnippets(p),
    ownerName,
    ownerId,
    cid: mapCid(p),
    knowledgeGraphId: asString(p[GMAPS_DETAILS_FIELDS.KG_ID]),
    internationalPhone: asString(
      dig(p, GMAPS_DETAILS_FIELDS.PHONE_INTL),
    ),
    websiteDomain: asString(dig(p, GMAPS_DETAILS_FIELDS.WEBSITE_DOMAIN)),
  };
}

/** Map full `/maps/preview/place` response → public details payload. */
export function mapPlaceDetails(
  data: unknown,
  richness: GmapsDetailsRichness,
): GMAPS_DETAILS_RESPONSE {
  const p = extractPlaceObject(data);
  if (!p) {
    throw new Error("[gmaps/details] Missing place object at response[6]");
  }

  const placeId = asString(p[GMAPS_DETAILS_FIELDS.PLACE_ID]);
  const featureId = asString(p[GMAPS_DETAILS_FIELDS.FEATURE_ID]);
  const matchedGroups = resolveByTypeGroups(p);
  const parsedAttrs = parseAttributes(p);
  const attrMapped = mapAttributes(parsedAttrs, matchedGroups);
  const common = mapCommon(p, attrMapped);
  const reviewCount =
    extractReviewCount(p) ??
    (common.reviewHistogram?.length
      ? common.reviewHistogram.reduce((sum, n) => sum + n, 0) || null
      : null);

  return {
    id: placeId,
    placeId,
    featureId,
    name: asString(p[GMAPS_DETAILS_FIELDS.NAME]),
    nameLocal: asString(p[GMAPS_DETAILS_FIELDS.NAME_LOCAL]),
    address:
      asString(p[GMAPS_DETAILS_FIELDS.FULL_ADDRESS]) ??
      asString(p[GMAPS_DETAILS_FIELDS.ALT_ADDRESS]),
    lat: asNumber(
      (p[GMAPS_DETAILS_FIELDS.COORDS] as unknown[] | undefined)?.[
        GMAPS_DETAILS_FIELDS.COORDS_LAT
      ],
    ),
    lng: asNumber(
      (p[GMAPS_DETAILS_FIELDS.COORDS] as unknown[] | undefined)?.[
        GMAPS_DETAILS_FIELDS.COORDS_LNG
      ],
    ),
    phone: asString(dig(p, GMAPS_DETAILS_FIELDS.PHONE)),
    website: asString(dig(p, GMAPS_DETAILS_FIELDS.WEBSITE)),
    rating: extractRating(p),
    reviewCount,
    categories: asStringArray(p[GMAPS_DETAILS_FIELDS.CATEGORIES]),
    gmapsUrl: placeId ? `${GMAPS.MAPS_PLACE_URL}${placeId}` : null,
    common,
    byType: attrMapped.byType,
    meta: {
      matchedGroups,
      source: GMAPS_DETAILS_SOURCE,
      richness,
    },
  };
}
