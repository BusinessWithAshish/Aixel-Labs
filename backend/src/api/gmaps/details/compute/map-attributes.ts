import {
  GMAPS_ATTR_ENTRIES_BY_GEO_ID,
  GMAPS_DETAILS_BY_TYPE_KEY,
  GMAPS_DETAILS_FIELDS,
  type GmapsDetailsByTypeKey,
} from "../constants";
import type {
  GmapsAttrBoolMap,
  GmapsOtherAttribute,
  GmapsParsedAttr,
} from "../types";

const GEO_TYPE_RE = /^\/geo\/type\//;

/**
 * Recursively extract `/geo/type/...` attributes from p[100].
 *
 * Typical node:
 *   [geoId, displayLabel, [flag, [[code, selectedLabel]], options], …]
 * Selected label starting with "No " ⇒ enabled false.
 */
export function parseAttributes(p: unknown[]): GmapsParsedAttr[] {
  const root = p[GMAPS_DETAILS_FIELDS.ATTRIBUTES];
  const found = new Map<string, GmapsParsedAttr>();

  const walk = (node: unknown, depth = 0) => {
    if (depth > 14 || node == null) return;
    if (!Array.isArray(node)) return;

    const geoIdx = node.findIndex(
      (x): x is string => typeof x === "string" && GEO_TYPE_RE.test(x),
    );

    if (geoIdx >= 0) {
      const geoId = node[geoIdx] as string;
      const displayLabel =
        typeof node[geoIdx + 1] === "string"
          ? (node[geoIdx + 1] as string)
          : geoId;

      let enabled = true;
      const meta = node[geoIdx + 2];
      if (Array.isArray(meta) && Array.isArray(meta[1])) {
        const selected = meta[1][0];
        if (Array.isArray(selected)) {
          const selectedLabel = asStringish(selected[1]);
          if (selectedLabel && /^No\s/i.test(selectedLabel)) enabled = false;
          else if (selected[0] === 0 && selectedLabel) enabled = false;
          else if (selectedLabel) enabled = !/^No\s/i.test(selectedLabel);
        }
      } else {
        const labels = node.filter(
          (x): x is string =>
            typeof x === "string" &&
            !GEO_TYPE_RE.test(x) &&
            !x.startsWith("http") &&
            x.length > 0 &&
            x.length < 120,
        );
        if (labels.some((l) => /^No\s/i.test(l)) && labels.length === 1) {
          enabled = false;
        }
      }

      const prev = found.get(geoId);
      if (!prev) {
        found.set(geoId, { id: geoId, label: displayLabel, enabled });
      }
      return;
    }

    for (const child of node) walk(child, depth + 1);
  };

  walk(root);
  return [...found.values()];
}

function asStringish(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function emptyByType(): Record<GmapsDetailsByTypeKey, GmapsAttrBoolMap | null> {
  return {
    [GMAPS_DETAILS_BY_TYPE_KEY.foodAndDrink]: null,
    [GMAPS_DETAILS_BY_TYPE_KEY.lodging]: null,
    [GMAPS_DETAILS_BY_TYPE_KEY.automotive]: null,
    [GMAPS_DETAILS_BY_TYPE_KEY.healthAndWellness]: null,
    [GMAPS_DETAILS_BY_TYPE_KEY.services]: null,
    [GMAPS_DETAILS_BY_TYPE_KEY.shopping]: null,
    [GMAPS_DETAILS_BY_TYPE_KEY.entertainmentAndRecreation]: null,
    [GMAPS_DETAILS_BY_TYPE_KEY.sports]: null,
    [GMAPS_DETAILS_BY_TYPE_KEY.finance]: null,
    [GMAPS_DETAILS_BY_TYPE_KEY.education]: null,
    [GMAPS_DETAILS_BY_TYPE_KEY.business]: null,
  };
}

export type MappedAttributes = {
  accessibility: GmapsAttrBoolMap | null;
  parking: GmapsAttrBoolMap | null;
  payment: GmapsAttrBoolMap | null;
  serviceOptions: GmapsAttrBoolMap | null;
  otherAttributes: GmapsOtherAttribute[];
  byType: Record<GmapsDetailsByTypeKey, GmapsAttrBoolMap | null>;
};

function setBool(
  map: GmapsAttrBoolMap,
  field: string,
  enabled: boolean,
): void {
  // Don't downgrade true → false if we already confirmed
  if (map[field] === true && !enabled) return;
  map[field] = enabled;
}

/**
 * Project parsed attrs into common buckets + byType groups.
 * Only fills byType keys that appear in `matchedGroups` (plus any
 * orphan byType fields go to otherAttributes).
 */
export function mapAttributes(
  attrs: GmapsParsedAttr[],
  matchedGroups: GmapsDetailsByTypeKey[],
): MappedAttributes {
  const accessibility: GmapsAttrBoolMap = {};
  const parking: GmapsAttrBoolMap = {};
  const payment: GmapsAttrBoolMap = {};
  const serviceOptions: GmapsAttrBoolMap = {};
  const byType = emptyByType();
  const matched = new Set(matchedGroups);
  const otherAttributes: GmapsOtherAttribute[] = [];
  const claimed = new Set<string>();

  for (const attr of attrs) {
    const entries = GMAPS_ATTR_ENTRIES_BY_GEO_ID.get(attr.id);
    if (!entries?.length) {
      otherAttributes.push({
        id: attr.id,
        label: attr.label,
        enabled: attr.enabled,
      });
      continue;
    }

    let used = false;
    for (const entry of entries) {
      if (entry.bucket === "accessibility") {
        setBool(accessibility, entry.field, attr.enabled);
        used = true;
      } else if (entry.bucket === "parking") {
        setBool(parking, entry.field, attr.enabled);
        used = true;
      } else if (entry.bucket === "payment") {
        setBool(payment, entry.field, attr.enabled);
        used = true;
      } else if (entry.bucket === "serviceOptions") {
        setBool(serviceOptions, entry.field, attr.enabled);
        used = true;
      } else if (entry.bucket === "byType" && entry.byTypeKey) {
        if (!matched.has(entry.byTypeKey)) continue;
        const bag = byType[entry.byTypeKey] ?? {};
        setBool(bag, entry.field, attr.enabled);
        byType[entry.byTypeKey] = bag;
        used = true;
      }
    }

    if (used) claimed.add(attr.id);
    else {
      otherAttributes.push({
        id: attr.id,
        label: attr.label,
        enabled: attr.enabled,
      });
    }
  }

  // Drop empty byType bags → null; keep matched groups that got fields
  for (const key of Object.keys(byType) as GmapsDetailsByTypeKey[]) {
    const bag = byType[key];
    if (!bag || Object.keys(bag).length === 0) {
      byType[key] = null;
    }
  }

  const nonempty = (m: GmapsAttrBoolMap) =>
    Object.keys(m).length ? m : null;

  return {
    accessibility: nonempty(accessibility),
    parking: nonempty(parking),
    payment: nonempty(payment),
    serviceOptions: nonempty(serviceOptions),
    otherAttributes,
    byType,
  };
}
