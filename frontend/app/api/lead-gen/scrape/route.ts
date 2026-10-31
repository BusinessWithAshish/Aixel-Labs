import { NextResponse } from 'next/server';
import { LEAD_GENERATION_SUB_MODULES, Modules, MongoObjectId } from '@aixellabs/backend/db';
import type { ALApiResponse } from '@aixellabs/backend/api/types';
import type { LeadData } from '@aixellabs/backend/db/types';
import { getUserCreditsState } from '@/app/actions/credit-db';
import { DAILY_LIMIT_MESSAGE, NO_CREDITS_MESSAGE } from '@/helpers/credits';
import { getAppSession } from '@/server/auth';
import { hasSubModuleAccess } from '@/helpers/module-access-helpers';
import { generateLeads } from '@/helpers/lead-gen-api';
import { startLeadGenRun } from '@/server/leads/run-limits';
import { saveScrapedLeads, type CreateUserLeadsResult } from '@/server/leads/save-scraped-leads';
import { capScrapeBodyToCredits, MAX_SCRAPE_BODY_BYTES, parseScrapeBody } from '@/server/leads/scrape-request';

export const maxDuration = 300;

const VALID_SUB_MODULES = new Set<string>(Object.values(LEAD_GENERATION_SUB_MODULES));

type ScrapeRequestBody = {
    subModule: LEAD_GENERATION_SUB_MODULES;
    body: unknown;
    listName: string;
};

function isScrapeRequest(value: unknown): value is ScrapeRequestBody {
    if (!value || typeof value !== 'object') return false;
    const o = value as Record<string, unknown>;
    return (
        typeof o.subModule === 'string' &&
        VALID_SUB_MODULES.has(o.subModule) &&
        'body' in o &&
        typeof o.listName === 'string' &&
        !!o.listName.trim()
    );
}

function isAbortError(error: unknown): boolean {
    return (
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && (error.name === 'AbortError' || error.name === 'CanceledError'))
    );
}

/**
 * Scrape, charge and save in one request, so none of them can be skipped or fed from the browser.
 * The scraped leads never leave the server: the response only says what was saved.
 */
export async function POST(request: Request): Promise<NextResponse<ALApiResponse<CreateUserLeadsResult>>> {
    const session = await getAppSession();
    if (!session?.user?.id) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rawBody = await request.text().catch(() => '');
    if (rawBody.length > MAX_SCRAPE_BODY_BYTES) {
        return NextResponse.json({ success: false, error: 'This search is too long' }, { status: 413 });
    }

    const payload = (() => {
        try {
            return JSON.parse(rawBody) as unknown;
        } catch {
            return null;
        }
    })();
    if (!isScrapeRequest(payload)) {
        return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const { subModule, listName } = payload;

    if (
        !session.user.isAdmin &&
        !hasSubModuleAccess(session.user.moduleAccess, Modules.LEAD_GENERATION, subModule)
    ) {
        return NextResponse.json(
            { success: false, error: 'Unauthorized: no access to this lead generation module' },
            { status: 403 },
        );
    }

    const parsed = parseScrapeBody(subModule, payload.body);
    if ('error' in parsed) {
        return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }

    const uid = new MongoObjectId(session.user.id);
    const { credits, spendable, exempt } = await getUserCreditsState(uid);
    if (!exempt && credits < 1) {
        return NextResponse.json({ success: false, error: NO_CREDITS_MESSAGE }, { status: 402 });
    }
    if (!exempt && spendable < 1) {
        return NextResponse.json({ success: false, error: DAILY_LIMIT_MESSAGE }, { status: 429 });
    }

    if (request.signal.aborted) {
        return NextResponse.json({ success: false, error: 'Request cancelled' }, { status: 499 });
    }

    const run = exempt ? null : await startLeadGenRun(uid, subModule, request.signal);
    if (run?.refused) {
        return NextResponse.json({ success: false, error: run.error }, { status: run.status });
    }

    try {
        const result = await generateLeads({
            subModule,
            body: exempt ? parsed.body : capScrapeBodyToCredits(subModule, parsed.body, spendable),
            signal: request.signal,
        });

        // Cancelled after the scrape finished: nothing saved, nothing charged.
        if (request.signal.aborted) {
            return NextResponse.json({ success: false, error: 'Request cancelled' }, { status: 499 });
        }

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error ?? 'Failed to generate leads' },
                { status: 502 },
            );
        }

        const leads: LeadData[] = result.data ?? [];
        if (!leads.length) {
            return NextResponse.json({
                success: true,
                data: { leads: [], remainingCredits: credits, creditsExempt: exempt, dailyLimitReached: false },
            });
        }

        const data = await saveScrapedLeads(uid, subModule, leads, listName.trim());
        return NextResponse.json({ success: true, data });
    } catch (error) {
        if (request.signal.aborted || isAbortError(error)) {
            return NextResponse.json({ success: false, error: 'Request cancelled' }, { status: 499 });
        }
        const message = error instanceof Error ? error.message : 'Failed to generate leads';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    } finally {
        await run?.finish();
    }
}
