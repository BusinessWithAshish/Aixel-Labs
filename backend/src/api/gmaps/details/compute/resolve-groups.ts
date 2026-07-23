import {
  GMAPS_DETAILS_BY_TYPE_KEY,
  GMAPS_DETAILS_FIELDS,
  GMAPS_GROUP_TO_BY_TYPE,
  type GmapsDetailsByTypeKey,
} from "../constants";
import {
  GMAPS_PLACE_TYPE_GROUP,
  type GmapsPlaceTypeGroupId,
} from "../../place-types/constants";
import { getPlaceTypeById } from "../../place-types/taxonomy";
import { asString, asStringArray } from "./parse-place";

/** Heuristic keyword → group when type id is unknown. */
const LABEL_GROUP_HINTS: { re: RegExp; group: GmapsPlaceTypeGroupId }[] = [
  {
    re: /restaurant|cafe|coffee|bar|bakery|food|pizza|diner|pub|tea|brunch|breakfast/i,
    group: GMAPS_PLACE_TYPE_GROUP.FOOD_AND_DRINK,
  },
  {
    re: /hotel|motel|hostel|lodge|resort|inn|guest\s*house/i,
    group: GMAPS_PLACE_TYPE_GROUP.LODGING,
  },
  {
    re: /gas\s*station|car\s*dealer|parking|mechanic|\bauto\b|ev\s*charg/i,
    group: GMAPS_PLACE_TYPE_GROUP.AUTOMOTIVE,
  },
  {
    re: /hospital|clinic|dentist|doctor|pharmacy|spa|wellness|yoga/i,
    group: GMAPS_PLACE_TYPE_GROUP.HEALTH,
  },
  {
    re: /lawyer|plumber|salon|agency|consultant|electrician|vet/i,
    group: GMAPS_PLACE_TYPE_GROUP.SERVICES,
  },
  {
    // Avoid matching "coffee shop" / "tea shop" — food already covered above
    re: /^(?!.*\b(coffee|tea|gift)\b).*\b(store|mall|market|supermarket|boutique)\b/i,
    group: GMAPS_PLACE_TYPE_GROUP.SHOPPING,
  },
  {
    re: /park|museum|theater|cinema|zoo|attraction|night\s*club/i,
    group: GMAPS_PLACE_TYPE_GROUP.ENTERTAINMENT,
  },
  {
    re: /gym|fitness|stadium|sports|golf|tennis|pool/i,
    group: GMAPS_PLACE_TYPE_GROUP.SPORTS,
  },
  {
    re: /bank|atm|credit\s*union|finance/i,
    group: GMAPS_PLACE_TYPE_GROUP.FINANCE,
  },
  {
    re: /school|university|college|library|preschool/i,
    group: GMAPS_PLACE_TYPE_GROUP.EDUCATION,
  },
  {
    re: /office|cowork|corporate|manufacturer/i,
    group: GMAPS_PLACE_TYPE_GROUP.BUSINESS,
  },
];

export function extractTypeIds(p: unknown[]): {
  primaryType: string | null;
  types: string[];
} {
  const raw = p[GMAPS_DETAILS_FIELDS.CATEGORY_IDS];
  const types: string[] = [];
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!Array.isArray(row)) continue;
      const id = asString(row[0]);
      if (id) types.push(id);
    }
  }

  // Fallback: slugify category labels when p[76] is absent
  if (!types.length) {
    const labels = asStringArray(p[GMAPS_DETAILS_FIELDS.CATEGORIES]) ?? [];
    for (const label of labels) {
      const slug = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
      if (slug) types.push(slug);
    }
  }

  return { primaryType: types[0] ?? null, types };
}

/**
 * Resolve which public `byType` keys apply for this place.
 * Uses p[76] type ids, curated taxonomy, then category label heuristics.
 */
export function resolveByTypeGroups(p: unknown[]): GmapsDetailsByTypeKey[] {
  const groups = new Set<GmapsPlaceTypeGroupId>();
  const { types } = extractTypeIds(p);

  for (const id of types) {
    const def = getPlaceTypeById(id);
    if (def) groups.add(def.groupId);
  }

  const categories = asStringArray(p[GMAPS_DETAILS_FIELDS.CATEGORIES]) ?? [];
  for (const label of categories) {
    for (const hint of LABEL_GROUP_HINTS) {
      if (hint.re.test(label)) groups.add(hint.group);
    }
  }

  // Also match type id strings against food/etc. when not in curated table
  for (const id of types) {
    if (getPlaceTypeById(id)) continue;
    for (const hint of LABEL_GROUP_HINTS) {
      if (hint.re.test(id.replace(/_/g, " "))) groups.add(hint.group);
    }
  }

  const keys = [...groups]
    .map((g) => GMAPS_GROUP_TO_BY_TYPE[g])
    .filter(Boolean);

  // Stable order matching BY_TYPE_KEY declaration
  const order = Object.values(GMAPS_DETAILS_BY_TYPE_KEY);
  return order.filter((k) => keys.includes(k));
}
