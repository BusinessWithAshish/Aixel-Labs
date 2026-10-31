import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { runDueCollection } from '@/server/line-finder/collect';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** Of the 300 s the platform allows, leaving time to finish the videos already in progress. */
const BUDGET_MS = 240_000;

const digest = (value: string) => createHash('sha256').update(value).digest();

function authorized(request: Request, secret: string): boolean {
    const presented = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
    return !!presented && timingSafeEqual(digest(presented), digest(secret));
}

/**
 * Collects the next batch of videos. Called every minute by the backend's ticker
 * (`backend/src/line-finder-ticker.ts`); no browser session, so it is gated by `CRON_SECRET`.
 */
export async function POST(request: Request) {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) return NextResponse.json({ success: false, error: 'CRON_SECRET is not set' }, { status: 503 });
    if (!authorized(request, secret)) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const data = await runDueCollection({ budgetMs: BUDGET_MS });
    return NextResponse.json({ success: true, data });
}
