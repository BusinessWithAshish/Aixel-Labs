/** Uploads are cropped to this square and re-encoded as JPEG in the browser before saving. */
export const AVATAR_SIZE_PX = 256;
export const AVATAR_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const AVATAR_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
/** Cap on the stored (re-encoded) JPEG; a 256 px JPEG is ~20 KB. */
export const AVATAR_MAX_BYTES = 150 * 1024;

const AVATAR_DATA_URL_PREFIX = 'data:image/jpeg;base64,';

/** Accepts only a base64 JPEG data URL under {@link AVATAR_MAX_BYTES} whose bytes really are a JPEG. */
export function parseUserAvatar(avatar: string): string {
    if (typeof avatar !== 'string' || !avatar.startsWith(AVATAR_DATA_URL_PREFIX)) {
        throw new Error('Profile photo must be a JPEG image');
    }
    const base64 = avatar.slice(AVATAR_DATA_URL_PREFIX.length);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
        throw new Error('Profile photo is not a valid image');
    }
    // base64 → bytes is 3/4; check before decoding so huge payloads are rejected cheaply
    if (base64.length * 0.75 > AVATAR_MAX_BYTES) {
        throw new Error('Profile photo is too large');
    }
    const bytes = atob(base64);
    const isJpeg =
        bytes.charCodeAt(0) === 0xff &&
        bytes.charCodeAt(1) === 0xd8 &&
        bytes.charCodeAt(2) === 0xff &&
        bytes.charCodeAt(bytes.length - 2) === 0xff &&
        bytes.charCodeAt(bytes.length - 1) === 0xd9;
    if (!isJpeg) {
        throw new Error('Profile photo is not a valid image');
    }
    return avatar;
}

/** Solid backgrounds that keep white text readable (Google-style letter avatars). */
const AVATAR_COLORS = ['#1a73e8', '#d93025', '#188038', '#e8710a', '#9334e6', '#c5221f', '#007b83', '#5f6368', '#b06000', '#3949ab'];

/** Stable colour per user, so the same person always gets the same background. */
export function avatarColor(seed: string): string {
    let hash = 0;
    for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function avatarInitial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
}
