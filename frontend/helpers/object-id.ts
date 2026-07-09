/** 24-char hex ObjectId — no `mongodb` import so this is safe in client bundles. */
const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

export function isValidObjectId(id: string): boolean {
    return typeof id === 'string' && OBJECT_ID_RE.test(id);
}
