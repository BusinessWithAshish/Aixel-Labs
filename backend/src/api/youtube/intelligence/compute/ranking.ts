export function computeRankByViews(
  itemId: string,
  items: Array<{ itemId: string; views: number | null }>,
): number | null {
  const ranked = [...items]
    .filter((item) => item.views !== null)
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0));

  const index = ranked.findIndex((item) => item.itemId === itemId);
  return index === -1 ? null : index + 1;
}
