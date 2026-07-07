import {
  hasContinuationItemRenderer,
  hasItemSectionRenderer,
} from "./type-guards";

/** Last continuation token in a flat InnerTube item list (video sidebar, channel grid). */
export function extractLastContinuationToken<T extends object>(
  items: readonly T[],
): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item && hasContinuationItemRenderer(item)) {
      return item.continuationItemRenderer.continuationEndpoint
        .continuationCommand.token;
    }
  }

  return null;
}

/** Recursively finds the first continuation token in nested search section items. */
export function extractNestedContinuationToken<T extends object>(
  sectionItems: readonly T[],
): string | null {
  for (const sectionItem of sectionItems) {
    if (hasContinuationItemRenderer(sectionItem)) {
      return sectionItem.continuationItemRenderer.continuationEndpoint
        .continuationCommand.token;
    }

    if (hasItemSectionRenderer(sectionItem)) {
      const nestedToken = extractNestedContinuationToken(
        sectionItem.itemSectionRenderer.contents,
      );
      if (nestedToken) return nestedToken;
    }
  }

  return null;
}
