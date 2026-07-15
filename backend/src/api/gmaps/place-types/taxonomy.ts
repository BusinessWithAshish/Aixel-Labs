import {
  GMAPS_EMPTY,
  GMAPS_PLACE_TYPE_GROUPS,
  GMAPS_PLACE_TYPES,
  type GmapsPlaceTypeDef,
  type GmapsPlaceTypeGroupId,
} from "./constants";

export type GmapsSelectOption = {
  value: string;
  label: string;
};

const byId = new Map<string, GmapsPlaceTypeDef>(
  GMAPS_PLACE_TYPES.map((t) => [t.id, t]),
);

const byGroup = new Map<GmapsPlaceTypeGroupId, GmapsPlaceTypeDef[]>();
for (const type of GMAPS_PLACE_TYPES) {
  const list = byGroup.get(type.groupId) ?? [];
  list.push(type);
  byGroup.set(type.groupId, list);
}

/** Stable tuple of all curated place-type ids (for z.enum). */
export const GMAPS_PLACE_TYPE_IDS = GMAPS_PLACE_TYPES.map(
  (t) => t.id,
) as unknown as readonly [string, ...string[]];

export const GMAPS_PLACE_TYPE_GROUP_OPTIONS: GmapsSelectOption[] =
  GMAPS_PLACE_TYPE_GROUPS.map((g) => ({
    value: g.id,
    label: g.label,
  }));

export const getPlaceTypeById = (
  id: string | undefined,
): GmapsPlaceTypeDef | undefined => {
  if (!id || id === GMAPS_EMPTY) return undefined;
  return byId.get(id);
};

export const getPlaceTypeLabel = (id: string | undefined): string =>
  getPlaceTypeById(id)?.label ?? GMAPS_EMPTY;

export const getPlaceTypeGroupId = (
  placeTypeId: string | undefined,
): GmapsPlaceTypeGroupId | typeof GMAPS_EMPTY =>
  getPlaceTypeById(placeTypeId)?.groupId ?? GMAPS_EMPTY;

export const getPlaceTypesForGroup = (
  groupId: string | undefined,
): readonly GmapsPlaceTypeDef[] => {
  if (!groupId || groupId === GMAPS_EMPTY) return [];
  return byGroup.get(groupId as GmapsPlaceTypeGroupId) ?? [];
};

export const getPlaceTypeOptionsForGroup = (
  groupId: string | undefined,
): GmapsSelectOption[] =>
  getPlaceTypesForGroup(groupId).map((t) => ({
    value: t.id,
    label: t.label,
  }));
