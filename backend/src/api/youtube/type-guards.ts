export type YT_CONTINUATION_ITEM = {
  continuationItemRenderer: {
    continuationEndpoint: {
      continuationCommand: { token: string };
    };
  };
};

export function hasContinuationItemRenderer<T extends object>(
  item: T,
): item is T & YT_CONTINUATION_ITEM {
  return "continuationItemRenderer" in item;
}

export function hasLockupViewModel<T extends object>(
  item: T,
): item is T & { lockupViewModel: unknown } {
  return "lockupViewModel" in item;
}

export function hasRichItemRenderer<T extends object>(
  item: T,
): item is T & { richItemRenderer: unknown } {
  return "richItemRenderer" in item;
}

export function hasItemSectionRenderer<T extends object>(
  item: T,
): item is T & { itemSectionRenderer: { contents: T[] } } {
  return "itemSectionRenderer" in item;
}

export function hasChannelRenderer<T extends object>(
  item: T,
): item is T & { channelRenderer: unknown } {
  return "channelRenderer" in item;
}

export function hasVideoRenderer<T extends object>(
  item: T,
): item is T & { videoRenderer: unknown } {
  return "videoRenderer" in item;
}
