import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { runDueBoards } from '@/server/content-lab/board-schedule';
import { contentLabError } from '@/server/content-lab/backend';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Of the 300 s the platform allows, minus time to record the last run. A board starts only with
 * `BOARD_RUN_MS` (4 min) of this left, so each call runs one board, or more when they are quick.
 */
const BUDGET_MS = 285_000;

const digest = (value: string) => createHash('sha256').update(value).digest();

/** `Authorization: Bearer <CRON_SECRET>`, the header Vercel Cron also sends. */
function authorized(request: Request, secret: string): boolean {
    const presented = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
    return !!presented && timingSafeEqual(digest(presented), digest(secret));
}

/**
 * Runs the scheduled boards that are due. Called every few minutes by the backend's ticker
 * (`backend/src/board-schedule-ticker.ts`); no browser session, so it is gated by `CRON_SECRET`.
 */
async function handle(request: Request) {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) return contentLabError('Scheduled board runs are off: CRON_SECRET is not set', 503);
    if (!authorized(request, secret)) return contentLabError('Unauthorized', 401);

    const data = await runDueBoards({ budgetMs: BUDGET_MS, signal: request.signal });
    return NextResponse.json({ success: true, data });
}

export const GET = handle;
export const POST = handle;
