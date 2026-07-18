import { NextResponse } from 'next/server';
import { LEAD_GENERATION_SUB_MODULES, Modules } from '@aixellabs/backend/db';
import type { ALApiResponse } from '@aixellabs/backend/api/types';
import type { LeadData } from '@aixellabs/backend/db/types';
import { getAppSession } from '@/server/auth';
import { hasSubModuleAccess } from '@/helpers/module-access-helpers';
import { generateLeads } from '@/helpers/lead-gen-api';

export const maxDuration = 300;

const VALID_SUB_MODULES = new Set<string>(Object.values(LEAD_GENERATION_SUB_MODULES));

type ScrapeRequestBody = {
    subModule: LEAD_GENERATION_SUB_MODULES;
    body: unknown;
};

function isScrapeRequest(value: unknown): value is ScrapeRequestBody {
    if (!value || typeof value !== 'object') return false;
    const o = value as Record<string, unknown>;
    return typeof o.subModule === 'string' && VALID_SUB_MODULES.has(o.subModule) && 'body' in o;
}

function isAbortError(error: unknown): boolean {
    return (
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && (error.name === 'AbortError' || error.name === 'CanceledError'))
    );
}

export async function POST(request: Request): Promise<NextResponse<ALApiResponse<LeadData[]>>> {
    const session = await getAppSession();
    if (!session?.user?.id) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json().catch(() => null);
    if (!isScrapeRequest(payload)) {
        return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const { subModule, body } = payload;

    if (
        !session.user.isAdmin &&
        !hasSubModuleAccess(session.user.moduleAccess, Modules.LEAD_GENERATION, subModule)
    ) {
        return NextResponse.json(
            { success: false, error: 'Unauthorized: no access to this lead generation module' },
            { status: 403 },
        );
    }

    if (request.signal.aborted) {
        return NextResponse.json({ success: false, error: 'Request cancelled' }, { status: 499 });
    }

    try {
        const result = await generateLeads({
            subModule,
            body,
            signal: request.signal,
        });

        if (request.signal.aborted) {
            return NextResponse.json({ success: false, error: 'Request cancelled' }, { status: 499 });
        }

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error ?? 'Failed to generate leads' },
                { status: 502 },
            );
        }

        return NextResponse.json({ success: true, data: result.data ?? [] });
    } catch (error) {
        if (request.signal.aborted || isAbortError(error)) {
            return NextResponse.json({ success: false, error: 'Request cancelled' }, { status: 499 });
        }
        const message = error instanceof Error ? error.message : 'Failed to generate leads';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
