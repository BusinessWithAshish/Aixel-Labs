export function toNumber(value: string | number | null) {
    if (typeof value !== 'string') return value;

    const cleaned = value.replace(/,/g, '').trim();
    const num = Number(cleaned);

    return Number.isNaN(num) ? value : num;
}

export function toBoolean(value: string | boolean | null) {
    if (typeof value !== 'string') return value;
    const v = value.toLowerCase().trim();
    if (v === 'true') return true;
    if (v === 'false') return false;
    return value;
}
