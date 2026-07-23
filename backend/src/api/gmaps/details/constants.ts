import { GMAPS_PLACE_TYPE_GROUP } from "../place-types/constants";
import type { GmapsPlaceTypeGroupId } from "../place-types/constants";

export const GMAPS_DETAILS_ROUTES = {
  DETAILS: "/details",
} as const;

export const GMAPS_DETAILS_ERROR_MESSAGES = {
  INVALID_PARAMS:
    "Provide placeId, featureId, or a Google Maps place url.",
  MISSING_IDENTIFIER: "At least one of placeId, featureId, or url is required.",
  PLACE_NOT_FOUND: "Could not resolve or fetch place details.",
  GENERIC: "Failed to fetch Google Maps place details.",
} as const;

export const GMAPS_DETAILS_DEFAULTS = {
  HL: "en",
  GL: "us",
  RICHNESS: "slim" as const,
  SCREEN_W: 1024,
  SCREEN_H: 768,
  ALTITUDE: 3585,
} as const;

/** Undocumented place-details endpoint (JsProtoUrlSerializer `pb`). */
export const GMAPS_DETAILS_PLACE_URL =
  "https://www.google.com/maps/preview/place";

export const GMAPS_DETAILS_PLACE_PAGE_URL =
  "https://www.google.com/maps/place/?q=place_id:";

export const GMAPS_DETAILS_SOURCE = "preview/place" as const;

/** Response shape keys for `byType` (camelCase public API). */
export const GMAPS_DETAILS_BY_TYPE_KEY = {
  foodAndDrink: "foodAndDrink",
  lodging: "lodging",
  automotive: "automotive",
  healthAndWellness: "healthAndWellness",
  services: "services",
  shopping: "shopping",
  entertainmentAndRecreation: "entertainmentAndRecreation",
  sports: "sports",
  finance: "finance",
  education: "education",
  business: "business",
} as const;

export type GmapsDetailsByTypeKey =
  (typeof GMAPS_DETAILS_BY_TYPE_KEY)[keyof typeof GMAPS_DETAILS_BY_TYPE_KEY];

/** Place-type group id → public byType key. */
export const GMAPS_GROUP_TO_BY_TYPE: Record<
  GmapsPlaceTypeGroupId,
  GmapsDetailsByTypeKey
> = {
  [GMAPS_PLACE_TYPE_GROUP.FOOD_AND_DRINK]:
    GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  [GMAPS_PLACE_TYPE_GROUP.LODGING]: GMAPS_DETAILS_BY_TYPE_KEY.lodging,
  [GMAPS_PLACE_TYPE_GROUP.AUTOMOTIVE]: GMAPS_DETAILS_BY_TYPE_KEY.automotive,
  [GMAPS_PLACE_TYPE_GROUP.HEALTH]:
    GMAPS_DETAILS_BY_TYPE_KEY.healthAndWellness,
  [GMAPS_PLACE_TYPE_GROUP.SERVICES]: GMAPS_DETAILS_BY_TYPE_KEY.services,
  [GMAPS_PLACE_TYPE_GROUP.SHOPPING]: GMAPS_DETAILS_BY_TYPE_KEY.shopping,
  [GMAPS_PLACE_TYPE_GROUP.ENTERTAINMENT]:
    GMAPS_DETAILS_BY_TYPE_KEY.entertainmentAndRecreation,
  [GMAPS_PLACE_TYPE_GROUP.SPORTS]: GMAPS_DETAILS_BY_TYPE_KEY.sports,
  [GMAPS_PLACE_TYPE_GROUP.FINANCE]: GMAPS_DETAILS_BY_TYPE_KEY.finance,
  [GMAPS_PLACE_TYPE_GROUP.EDUCATION]: GMAPS_DETAILS_BY_TYPE_KEY.education,
  [GMAPS_PLACE_TYPE_GROUP.BUSINESS]: GMAPS_DETAILS_BY_TYPE_KEY.business,
};

/**
 * Protobuf field paths on place object `p = response[6]`.
 * Keep in sync with PLACE_DETAILS_FINDINGS.md / console-debugger.
 */
export const GMAPS_DETAILS_FIELDS = {
  NAME: 11,
  NAME_LOCAL: 101,
  PLACE_ID: 78,
  FEATURE_ID: 10,
  FULL_ADDRESS: 18,
  ALT_ADDRESS: 39,
  COORDS: 9,
  COORDS_LAT: 2,
  COORDS_LNG: 3,
  PHONE: [178, 0, 0] as const,
  PHONE_INTL: [178, 0, 1, 1, 0] as const,
  PHONE_DIGITS: [178, 0, 3] as const,
  WEBSITE: [7, 0] as const,
  WEBSITE_DOMAIN: [7, 1] as const,
  CATEGORIES: 13,
  RATING_BLOCK: 4,
  RATING: 7,
  REVIEW_COUNT: 8,
  PRICE_TEXT: 2,
  PRICE_RANGE: 10,
  TIMEZONE: 30,
  NEIGHBORHOOD: 14,
  CITY_REGION: 166,
  COUNTRY: 243,
  CATEGORY_IDS: 76,
  EDITORIAL: 32,
  DWELL: 117,
  HOURS: 203,
  POPULAR_TIMES: 84,
  ADDRESS_BLOCK: 183,
  ATTRIBUTES: 100,
  RESERVATIONS: 46,
  ORDER_LINKS: 75,
  OWNER: 57,
  ID_BUNDLE: 227,
  REVIEW_HISTOGRAM: 175,
  REVIEW_TOPICS: 153,
  REVIEW_SNIPPETS: 31,
  PHOTOS_A: 51,
  PHOTOS_B: 171,
  KG_ID: 89,
  CID_BLOCK: 181,
} as const;

/**
 * Extra pb flags appended for `richness: "rich"` to pull photos, owner,
 * review topics/histogram, geo hierarchy (from live Maps capture 2026-07).
 */
export const GMAPS_DETAILS_RICH_PB_FLAGS =
  "!12m4!2m3!1i360!2i120!4i8" +
  "!13m57!2m2!1i203!2i100!3m2!2i4!5b1!6m6!1m2!1i86!2i86!1m2!1i408!2i240" +
  "!7m33!1m3!1e1!2b0!3e3!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3!1m3!1e8!2b0!3e3" +
  "!1m3!1e10!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e10!2b0!3e4!1m3!1e9!2b1!3e2!2b1!9b0" +
  "!15m8!1m7!1m2!1m1!1e2!2m2!1i195!2i195!3i20" +
  "!15m111!1m29!4e2!13m9!2b1!3b1!4b1!6i1!8b1!9b1!14b1!20b1!25b1" +
  "!18m17!3b1!4b1!5b1!6b1!9b1!13b1!14b1!17b1!20b1!21b1!22b1!30b1!32b1!33m1!1b1!34b1!36e2" +
  "!10m1!8e3!11m1!3e1!17b1!20m2!1e3!1e6!24b1!25b1!26b1!27b1!29b1!30m1!2b1!36b1!37b1" +
  "!39m3!2m2!2i1!3i1!43b1!52b1!54m1!1b1!55b1!56m1!1b1!61m2!1m1!1e1" +
  "!65m5!3m4!1m3!1m2!1i224!2i298" +
  "!72m22!1m8!2b1!5b1!7b1!12m4!1b1!2b1!4m1!1e1!4b1" +
  "!8m10!1m6!4m1!1e1!4m1!1e3!4m1!1e4" +
  "!3sother_user_google_review_posts__and__hotel_and_vr_partner_review_posts" +
  "!6m1!1e1!9b1!89b1!90m2!1m1!1e2!98m3!1b1!2b1!3b1!103b1!113b1" +
  "!114m3!1b1!2m1!1b1!117b1!122m1!1b1!126b1!127b1!128m1!1b0" +
  "!21m0!22m1!1e81!29m0!30m6!3b1!6m1!2b1!7m1!2b1!9b1" +
  "!34m5!7b1!10b1!14b1!15m1!1b0!37i787";

export type AttrBucket =
  | "accessibility"
  | "parking"
  | "payment"
  | "serviceOptions"
  | "byType";

export type AttrRegistryEntry = {
  /** Full `/geo/type/...` id suffix after last path segment, or full path. */
  geoId: string;
  /** Public boolean field name when projecting. */
  field: string;
  bucket: AttrBucket;
  /** Required when bucket === "byType". */
  byTypeKey?: GmapsDetailsByTypeKey;
};

/**
 * SSOT: Maps About `/geo/type/...` ids → common buckets or byType fields.
 * Covers Places API atmosphere-style fields + observed Maps labels.
 */
export const GMAPS_ATTR_REGISTRY: readonly AttrRegistryEntry[] = [
  // ── Common: accessibility ───────────────────────────────────
  {
    geoId: "/geo/type/establishment_poi/has_wheelchair_accessible_parking",
    field: "wheelchairAccessibleParking",
    bucket: "accessibility",
  },
  {
    geoId: "/geo/type/establishment_poi/has_wheelchair_accessible_entrance",
    field: "wheelchairAccessibleEntrance",
    bucket: "accessibility",
  },
  {
    geoId: "/geo/type/establishment_poi/has_wheelchair_accessible_seating",
    field: "wheelchairAccessibleSeating",
    bucket: "accessibility",
  },
  {
    geoId: "/geo/type/establishment_poi/has_wheelchair_accessible_restroom",
    field: "wheelchairAccessibleRestroom",
    bucket: "accessibility",
  },

  // ── Common: parking ─────────────────────────────────────────
  {
    geoId: "/geo/type/establishment_poi/has_parking_lot_free",
    field: "freeParkingLot",
    bucket: "parking",
  },
  {
    geoId: "/geo/type/establishment_poi/has_parking_street_free",
    field: "freeStreetParking",
    bucket: "parking",
  },
  {
    geoId: "/geo/type/establishment_poi/has_parking_street_paid",
    field: "paidStreetParking",
    bucket: "parking",
  },
  {
    geoId: "/geo/type/establishment_poi/has_parking_lot_paid",
    field: "paidParkingLot",
    bucket: "parking",
  },
  {
    geoId: "/geo/type/establishment_poi/has_valet_parking",
    field: "valetParking",
    bucket: "parking",
  },

  // ── Common: payment ─────────────────────────────────────────
  {
    geoId: "/geo/type/establishment_poi/pay_debit_card",
    field: "debitCards",
    bucket: "payment",
  },
  {
    geoId: "/geo/type/establishment_poi/pay_credit_card",
    field: "creditCards",
    bucket: "payment",
  },
  {
    geoId: "/geo/type/establishment_poi/pay_mobile_tez",
    field: "googlePay",
    bucket: "payment",
  },
  {
    geoId: "/geo/type/establishment_poi/pay_mobile_nfc",
    field: "nfcMobilePayments",
    bucket: "payment",
  },
  {
    geoId: "/geo/type/establishment_poi/requires_cash_only",
    field: "cashOnly",
    bucket: "payment",
  },

  // ── Common: service options ─────────────────────────────────
  {
    geoId: "/geo/type/establishment_poi/has_delivery",
    field: "delivery",
    bucket: "serviceOptions",
  },
  {
    geoId: "/geo/type/establishment_poi/has_takeout",
    field: "takeout",
    bucket: "serviceOptions",
  },
  {
    geoId: "/geo/type/establishment_poi/serves_dine_in",
    field: "dineIn",
    bucket: "serviceOptions",
  },
  {
    geoId: "/geo/type/establishment_poi/has_curbside_pickup",
    field: "curbsidePickup",
    bucket: "serviceOptions",
  },
  {
    geoId: "/geo/type/establishment_poi/has_onsite_services",
    field: "onsiteServices",
    bucket: "serviceOptions",
  },

  // ── Food & drink ────────────────────────────────────────────
  {
    geoId: "/geo/type/establishment_poi/serves_breakfast",
    field: "servesBreakfast",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/serves_brunch",
    field: "servesBrunch",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/serves_lunch",
    field: "servesLunch",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/serves_dinner",
    field: "servesDinner",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/serves_coffee",
    field: "servesCoffee",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/serves_tea",
    field: "servesTea",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/serves_beer",
    field: "servesBeer",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/serves_wine",
    field: "servesWine",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/serves_cocktails",
    field: "servesCocktails",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/serves_alcohol",
    field: "servesAlcohol",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/serves_vegetarian",
    field: "servesVegetarian",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment/serves_vegan",
    field: "servesVegan",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/serves_dessert",
    field: "servesDessert",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/has_seating_outdoors",
    field: "outdoorSeating",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/accepts_reservations",
    field: "reservable",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/suitable_for_groups",
    field: "goodForGroups",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/welcomes_children",
    field: "goodForChildren",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/has_live_music",
    field: "liveMusic",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/suitable_for_watching_sports",
    field: "goodForWatchingSports",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/has_restroom",
    field: "restroom",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/has_table_service",
    field: "tableService",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/quick_bite",
    field: "quickBite",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/has_catering",
    field: "catering",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/has_childrens_menu",
    field: "menuForChildren",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },
  {
    geoId: "/geo/type/establishment_poi/allows_dogs",
    field: "allowsDogs",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink,
  },

  // ── Lodging ─────────────────────────────────────────────────
  {
    geoId: "/geo/type/establishment_poi/has_wifi",
    field: "wifi",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.lodging,
  },
  {
    geoId: "/geo/type/establishment_poi/has_air_conditioning",
    field: "airConditioning",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.lodging,
  },
  {
    geoId: "/geo/type/establishment_poi/allows_dogs",
    field: "allowsDogs",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.lodging,
  },
  {
    geoId: "/geo/type/establishment_poi/has_restaurant",
    field: "hasRestaurant",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.lodging,
  },
  {
    geoId: "/geo/type/establishment_poi/has_fitness_center",
    field: "fitnessCenter",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.lodging,
  },

  // ── Automotive ──────────────────────────────────────────────
  {
    geoId: "/geo/type/establishment_poi/has_ev_charging",
    field: "evCharging",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.automotive,
  },
  {
    geoId: "/geo/type/establishment_poi/has_fuel",
    field: "fuel",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.automotive,
  },
  {
    geoId: "/geo/type/establishment_poi/has_car_wash",
    field: "carWash",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.automotive,
  },

  // ── Health ──────────────────────────────────────────────────
  {
    geoId: "/geo/type/establishment_poi/requires_appointments",
    field: "requiresAppointments",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.healthAndWellness,
  },
  {
    geoId: "/geo/type/establishment_poi/has_wheelchair_accessible_restroom",
    field: "wheelchairAccessibleRestroom",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.healthAndWellness,
  },

  // ── Services ────────────────────────────────────────────────
  {
    geoId: "/geo/type/establishment_poi/requires_appointments",
    field: "requiresAppointments",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.services,
  },
  {
    geoId: "/geo/type/establishment_poi/is_service_area_business",
    field: "serviceAreaBusiness",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.services,
  },

  // ── Shopping ────────────────────────────────────────────────
  {
    geoId: "/geo/type/establishment_poi/has_in_store_shopping",
    field: "inStoreShopping",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.shopping,
  },
  {
    geoId: "/geo/type/establishment_poi/has_in_store_pickup",
    field: "inStorePickup",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.shopping,
  },
  {
    geoId: "/geo/type/establishment_poi/has_delivery",
    field: "delivery",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.shopping,
  },

  // ── Entertainment ───────────────────────────────────────────
  {
    geoId: "/geo/type/establishment_poi/has_live_music",
    field: "liveMusic",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.entertainmentAndRecreation,
  },
  {
    geoId: "/geo/type/establishment_poi/good_for_kids",
    field: "goodForChildren",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.entertainmentAndRecreation,
  },

  // ── Sports ──────────────────────────────────────────────────
  {
    geoId: "/geo/type/establishment_poi/has_fitness_center",
    field: "fitnessCenter",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.sports,
  },
  {
    geoId: "/geo/type/establishment_poi/has_gender_neutral_restroom",
    field: "genderNeutralRestroom",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.sports,
  },

  // ── Finance / education / business (sparse) ─────────────────
  {
    geoId: "/geo/type/establishment_poi/has_wheelchair_accessible_entrance",
    field: "wheelchairAccessibleEntrance",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.finance,
  },
  {
    geoId: "/geo/type/establishment_poi/has_wheelchair_accessible_entrance",
    field: "wheelchairAccessibleEntrance",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.education,
  },
  {
    geoId: "/geo/type/establishment_poi/has_wifi",
    field: "wifi",
    bucket: "byType",
    byTypeKey: GMAPS_DETAILS_BY_TYPE_KEY.business,
  },
] as const;

/** Lookup by full geo id (first match for common buckets). */
export const GMAPS_ATTR_BY_GEO_ID = new Map(
  GMAPS_ATTR_REGISTRY.map((e) => [e.geoId, e]),
);

/** All registry entries for a geo id (an id can map to common + byType). */
export const GMAPS_ATTR_ENTRIES_BY_GEO_ID = (() => {
  const m = new Map<string, AttrRegistryEntry[]>();
  for (const e of GMAPS_ATTR_REGISTRY) {
    const list = m.get(e.geoId) ?? [];
    list.push(e);
    m.set(e.geoId, list);
  }
  return m;
})();
