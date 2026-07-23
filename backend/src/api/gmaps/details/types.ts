import { z } from "zod";
import type { GMAPS_DETAILS_REQUEST_SCHEMA } from "./schemas";
import type { GmapsDetailsByTypeKey } from "./constants";

export type GMAPS_DETAILS_REQUEST = z.output<typeof GMAPS_DETAILS_REQUEST_SCHEMA>;

export type GmapsDetailsRichness = "slim" | "rich";

export type GmapsOpeningHoursRange = {
  text: string | null;
  /** [[openH, openM?], [closeH, closeM?]] */
  times: number[][] | null;
};

export type GmapsOpeningHoursDay = {
  day: string | null;
  dayIndex: number | null;
  date: [number, number, number] | null;
  ranges: GmapsOpeningHoursRange[];
};

export type GmapsPopularTimesHour = {
  hour: number | null;
  busyPercent: number | null;
  label: string | null;
  timeLabel: string | null;
};

export type GmapsPopularTimesDay = {
  dayIndex: number | null;
  hours: GmapsPopularTimesHour[];
};

export type GmapsAddressComponents = {
  neighborhood: string | null;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  state: string | null;
  country: string | null;
  floor: string | null;
};

export type GmapsExternalLink = {
  url: string;
  domain: string | null;
};

export type GmapsReviewTopic = {
  id: string | null;
  topic: string;
};

export type GmapsReviewSnippet = {
  text: string;
  authorUrl: string | null;
};

export type GmapsOtherAttribute = {
  id: string;
  label: string;
  enabled: boolean;
};

export type GmapsAttrBoolMap = Record<string, boolean | null>;

export type GmapsDetailsCommon = {
  primaryType: string | null;
  types: string[];
  priceText: string | null;
  priceRange: string | null;
  timezone: string | null;
  countryCode: string | null;
  neighborhood: string | null;
  cityRegion: string | null;
  plusCode: string | null;
  plusCodeGlobal: string | null;
  addressComponents: GmapsAddressComponents | null;
  editorialTitle: string | null;
  editorialSummary: string | null;
  dwellTime: string | null;
  openStatus: string | null;
  openingHours: GmapsOpeningHoursDay[] | null;
  popularTimes: GmapsPopularTimesDay[] | null;
  accessibility: GmapsAttrBoolMap | null;
  parking: GmapsAttrBoolMap | null;
  payment: GmapsAttrBoolMap | null;
  serviceOptions: GmapsAttrBoolMap | null;
  otherAttributes: GmapsOtherAttribute[];
  reservations: GmapsExternalLink[];
  orderLinks: GmapsExternalLink[];
  photos: string[];
  reviewHistogram: number[] | null;
  reviewTopics: GmapsReviewTopic[];
  reviewSnippets: GmapsReviewSnippet[];
  ownerName: string | null;
  ownerId: string | null;
  cid: string | null;
  knowledgeGraphId: string | null;
  internationalPhone: string | null;
  websiteDomain: string | null;
};

/** Type-specific extras — boolean maps; null group = not applicable. */
export type GmapsDetailsByType = Record<
  GmapsDetailsByTypeKey,
  GmapsAttrBoolMap | null
>;

export type GmapsDetailsMeta = {
  matchedGroups: GmapsDetailsByTypeKey[];
  source: "preview/place";
  richness: GmapsDetailsRichness;
};

export type GMAPS_DETAILS_RESPONSE = {
  id: string | null;
  placeId: string | null;
  featureId: string | null;
  name: string | null;
  nameLocal: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  categories: string[] | null;
  gmapsUrl: string | null;
  common: GmapsDetailsCommon;
  byType: GmapsDetailsByType;
  meta: GmapsDetailsMeta;
};

/** Parsed attribute from p[100]. */
export type GmapsParsedAttr = {
  id: string;
  label: string;
  enabled: boolean;
};
