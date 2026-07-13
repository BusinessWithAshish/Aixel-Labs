import 'server-only';

import { SESSION_COOKIE_EXPIRES_MS, SESSION_COOKIE_NAME } from '@/lib/auth/constants';

export const sessionCookieOptions = {
    name: SESSION_COOKIE_NAME,
    maxAge: SESSION_COOKIE_EXPIRES_MS / 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
} as const;

export function sessionCookieSetOptions(value: string) {
    return { ...sessionCookieOptions, value };
}

export function sessionCookieClearOptions() {
    return { ...sessionCookieOptions, value: '', maxAge: 0 };
}
