import 'server-only';

import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;
const BCRYPT_HASH_RE = /^\$2[aby]?\$/;

export function isBcryptHash(value: string): boolean {
    return BCRYPT_HASH_RE.test(value);
}

export async function hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(
    plain: string,
    stored: string,
): Promise<{ ok: boolean; needsRehash: boolean }> {
    if (isBcryptHash(stored)) {
        const ok = await bcrypt.compare(plain, stored);
        return { ok, needsRehash: false };
    }

    // Legacy plaintext passwords — upgrade to bcrypt on next successful login.
    const ok = plain === stored;
    return { ok, needsRehash: ok };
}
