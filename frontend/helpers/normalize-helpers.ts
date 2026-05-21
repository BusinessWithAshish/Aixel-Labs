export function toNumber(value: string | number | null) {
    if (typeof value !== 'string') return value;

    const cleaned = value.replace(/,/g, '').trim();
    if (cleaned === '') return value;
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

export type WithStringId<T extends { _id?: unknown }> = Omit<T, '_id'> & {
    _id?: string;
};

export function mapMongoDocToClient<T extends { _id?: { toString(): string } | null | undefined }>(doc: T): WithStringId<T> {
    const { _id, ...rest } = doc;
    return {
        ...rest,
        _id: _id?.toString(),
    } as WithStringId<T>;
}
