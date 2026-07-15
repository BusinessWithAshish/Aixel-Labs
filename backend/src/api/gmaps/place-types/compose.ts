import { GMAPS_EMPTY, GMAPS_SEARCH_QUERY_JOIN } from "./constants";
import { getPlaceTypeLabel } from "./taxonomy";

export type BuildGmapsSearchQueryInput = {
  placeType?: string;
  query?: string;
};

const nonEmpty = (value: string | undefined): string => {
  const trimmed = value?.trim() ?? GMAPS_EMPTY;
  return trimmed.length > 0 ? trimmed : GMAPS_EMPTY;
};

/**
 * Compose the Maps search text from optional keywords + place-type label.
 * Order: keywords first, then type label (e.g. "emergency dentist").
 */
export const buildGmapsSearchQuery = ({
  placeType,
  query,
}: BuildGmapsSearchQueryInput): string => {
  const keywords = nonEmpty(query);
  const typeLabel = nonEmpty(getPlaceTypeLabel(placeType));

  return [keywords, typeLabel]
    .filter((part) => part !== GMAPS_EMPTY)
    .join(GMAPS_SEARCH_QUERY_JOIN);
};
