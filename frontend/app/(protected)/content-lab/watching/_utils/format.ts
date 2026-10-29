/** "3 times their usual views", "12 times their usual views": what a post's multiple means, in words. */
export function timesUsual(multiple: number, short = false): string {
    const times = multiple >= 10 ? Math.round(multiple) : Number(multiple.toFixed(1));
    return short ? `${times}× usual` : `${times} times their usual views`;
}
