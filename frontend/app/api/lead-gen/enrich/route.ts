import { NextResponse } from 'next/server';
import { LEAD_GENERATION_SUB_MODULES, Modules, MongoObjectId } from '@aixellabs/backend/db';
import type { ALApiResponse } from '@aixellabs/backend/api/types';
import { getUserCreditsState } from '@/app/actions/credit-db';
import { DAILY_LIMIT_MESSAGE, NO_CREDITS_MESSAGE } from '@/helpers/credits';
import { hasSubModuleAccess } from '@/helpers/module-access-helpers';
import { getAppSession } from '@/server/auth';
import { enrichOwnedLeads, type EnrichLeadsResult } from '@/server/leads/enrich-leads';
import { startLeadGenRun } from '@/server/leads/run-limits';

export const maxDuration = 300;

/** One batch is 50 websites; many leads can share a website, but not without limit. */
const MAX_LEAD_IDS = 2000;

/** One enrich batch: crawl, charge and save on the server, for websites read from the user's own leads. */
export async function POST(request: Request): Promise<NextResponse<ALApiResponse<EnrichLeadsResult>>> {
    const session = await getAppSession();
    if (!session?.user?.id) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (
        !session.user.isAdmin &&
        !hasSubModuleAccess(session.user.moduleAccess, Modules.LEAD_GENERATION, LEAD_GENERATION_SUB_MODULES.CRAWL)
    ) {
        return NextResponse.json({ success: false, error: 'Unauthorized: no access to Crawl' }, { status: 403 });
    }

    const payload = (await request.json().catch(() => null)) as { leadIds?: unknown } | null;
    const leadIds = payload?.leadIds;
    if (
        !Array.isArray(leadIds) ||
        !leadIds.length ||
        leadIds.length > MAX_LEAD_IDS ||
        !leadIds.every((id) => typeof id === 'string')
    ) {
        return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const uid = new MongoObjectId(session.user.id);
    const { credits, spendable, exempt } = await getUserCreditsState(uid);
    if (!exempt && credits < 1) {
        return NextResponse.json({ success: false, error: NO_CREDITS_MESSAGE }, { status: 402 });
    }
    if (!exempt && spendable < 1) {
        return NextResponse.json({ success: false, error: DAILY_LIMIT_MESSAGE }, { status: 429 });
    }

    const run = exempt ? null : await startLeadGenRun(uid, LEAD_GENERATION_SUB_MODULES.CRAWL, request.signal);
    if (run?.refused) {
        return NextResponse.json({ success: false, error: run.error }, { status: run.status });
    }

    try {
        const data = await enrichOwnedLeads(uid, leadIds, { balance: credits, spendable, exempt }, request.signal);
        return NextResponse.json({ success: true, data });
    } catch (error) {
        if (request.signal.aborted) {
            return NextResponse.json({ success: false, error: 'Request cancelled' }, { status: 499 });
        }
        const message = error instanceof Error ? error.message : 'Failed to enrich leads';
        return NextResponse.json({ success: false, error: message }, { status: 502 });
    } finally {
        await run?.finish();
    }
}
