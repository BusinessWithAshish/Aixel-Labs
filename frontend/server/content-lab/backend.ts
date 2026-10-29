import 'server-only';

import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { CONTENT_LAB_SUB_MODULES, Modules } from '@aixellabs/backend/db';
import type { ALApiResponse } from '@aixellabs/backend/api/types';
import { CONTENT_LAB_ERROR_MESSAGES } from '@aixellabs/backend/content-lab/constants';
import type { AppSession } from '@/lib/auth/types';
import { getAppSession } from '@/server/auth';
import { hasSubModuleAccess } from '@/helpers/module-access-helpers';
import apiClient from '@/lib/api-client';

const CANCELLED = 'Request cancelled';

export function contentLabError(error: string, status: number): NextResponse<ALApiResponse<never>> {
    return NextResponse.json({ success: false, error }, { status });
}

/** The signed-in user, when they may use Content Lab (admin, or any Content Lab page granted); else the 401/403 to return. */
export async function requireContentLabSession(): Promise<{ session: AppSession } | { response: NextResponse }> {
    const session = await getAppSession();
    if (!session?.user?.id) return { response: contentLabError('Unauthorized', 401) };
    const granted =
        session.user.isAdmin ||
        Object.values(CONTENT_LAB_SUB_MODULES).some((subModule) =>
            hasSubModuleAccess(session.user.moduleAccess, Modules.CONTENT_LAB, subModule),
        );
    if (!granted) return { response: contentLabError('Unauthorized: no access to Content Lab', 403) };
    return { session };
}

/** Session + JSON body parsed with the backend's own Zod schema; else the error response to return. */
export async function readContentLabBody<T>(
    request: Request,
    schema: ZodType<T, unknown>,
): Promise<{ body: T; session: AppSession } | { response: NextResponse }> {
    const auth = await requireContentLabSession();
    if ('response' in auth) return auth;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return { response: contentLabError(CONTENT_LAB_ERROR_MESSAGES.INVALID_PARAMS, 400) };
    return { body: parsed.data, session: auth.session };
}

/** Posts to the backend with the browser's abort signal and maps the result to the BFF's status codes. */
export async function forwardToBackend<TRes>(request: Request, endpoint: string, body: unknown): Promise<NextResponse> {
    if (request.signal.aborted) return contentLabError(CANCELLED, 499);
    const result = await apiClient.post<TRes>(endpoint, body, { signal: request.signal });
    if (request.signal.aborted) return contentLabError(CANCELLED, 499);
    if (!result.success) return contentLabError(result.error ?? 'Content Lab request failed', 502);
    return NextResponse.json({ success: true, data: result.data });
}

/** One route: auth, validate with the backend schema, forward. */
export async function handleContentLabProxy<T>(request: Request, schema: ZodType<T, unknown>, endpoint: string): Promise<NextResponse> {
    const read = await readContentLabBody(request, schema);
    if ('response' in read) return read.response;
    return forwardToBackend(request, endpoint, read.body);
}
