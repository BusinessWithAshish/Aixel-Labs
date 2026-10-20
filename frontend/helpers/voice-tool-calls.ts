import type { VoiceCallToolCall, VoiceCallTurn } from '@aixellabs/backend/db/types';

/** Built-in function names the engine gives the model (webhook tools use the owner's own names). */
export const BUILTIN_TOOLS = {
    CHECK_AVAILABILITY: 'check_availability',
    BOOK_APPOINTMENT: 'book_appointment',
    END_CALL: 'end_call',
} as const;

/** A tool run as the call log stores it, or as the playground socket reports it (no booking id there). */
export type ToolRun = Pick<VoiceCallToolCall, 'name' | 'arguments' | 'ok'> & {
    result?: string;
    durationMs?: number;
    /** undefined: not known (playground); null: the run created no booking. */
    bookingId?: string | null;
};

export type ToolRunKind = 'availability' | 'booking' | 'end' | 'webhook';

export type ToolRunSummary = {
    kind: ToolRunKind;
    title: string;
    /** Whether book_appointment actually created a booking. */
    booked: boolean;
    /** Short status for the badge; null when the title already says it. */
    status: { label: string; ok: boolean } | null;
};

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

/** "2026-10-18" -> "Sat 18 Oct". A calendar date, so it is formatted in UTC to keep the day. */
export function formatCalendarDate(isoDate: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
    if (!match) return isoDate;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** "14:00" -> "2:00 PM". */
export function formatClockTime(hhmm: string): string {
    const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!match) return hhmm;
    const hours = Number(match[1]);
    const suffix = hours >= 12 ? 'PM' : 'AM';
    return `${hours % 12 || 12}:${match[2]} ${suffix}`;
}

function slotLabel(args: Record<string, unknown>): string {
    const date = text(args.date);
    const time = text(args.time);
    const day = date ? formatCalendarDate(date) : '';
    if (day && time) return `${day}, ${formatClockTime(time)}`;
    return day || (time ? formatClockTime(time) : 'a slot');
}

/** One line in plain words, e.g. "Booked Sat 18 Oct, 2:00 PM for Ravi". */
export function summarizeToolRun(run: ToolRun): ToolRunSummary {
    const args = run.arguments ?? {};
    switch (run.name) {
        case BUILTIN_TOOLS.CHECK_AVAILABILITY: {
            const date = text(args.date);
            const after = text(args.after);
            const day = date ? ` · ${formatCalendarDate(date)}` : '';
            const from = after ? ` after ${formatClockTime(after)}` : '';
            return {
                kind: 'availability',
                title: `${run.ok ? 'Checked availability' : 'Could not check availability'}${day}${from}`,
                booked: false,
                status: run.ok ? null : { label: 'Failed', ok: false },
            };
        }
        case BUILTIN_TOOLS.BOOK_APPOINTMENT: {
            const name = text(args.name);
            const booked = run.bookingId === undefined ? run.ok : !!run.bookingId;
            const who = name ? ` for ${name}` : '';
            return {
                kind: 'booking',
                title: booked ? `Booked ${slotLabel(args)}${who}` : `Tried to book ${slotLabel(args)}${who}`,
                booked,
                status: booked ? null : { label: 'Not booked', ok: false },
            };
        }
        case BUILTIN_TOOLS.END_CALL:
            return { kind: 'end', title: 'Ended the call', booked: false, status: null };
        default:
            return {
                kind: 'webhook',
                title: run.name,
                booked: false,
                status: run.ok ? { label: 'OK', ok: true } : { label: 'Failed', ok: false },
            };
    }
}

export function formatToolArguments(args: Record<string, unknown>): string {
    try {
        return JSON.stringify(args ?? {}, null, 2);
    } catch {
        return String(args);
    }
}

/** Whether the call booked an appointment (for the call-logs badge). */
export function callBookedSomething(toolCalls: VoiceCallToolCall[] | undefined): boolean {
    return (toolCalls ?? []).some((tool) => tool.name === BUILTIN_TOOLS.BOOK_APPOINTMENT && !!tool.bookingId);
}

/**
 * Where each tool run shows in the merged transcript: the index of the bubble it follows,
 * or -1 for before the first one. `afterTurn` counts the engine's raw turns, and several raw
 * same-role fragments become one bubble, so raw positions are mapped onto bubbles first.
 */
export function placeToolCalls(
    rawTurns: VoiceCallTurn[],
    toolCalls: VoiceCallToolCall[] | undefined,
): Map<number, VoiceCallToolCall[]> {
    const bubbleOfRaw: number[] = [];
    let bubble = -1;
    rawTurns.forEach((turn, index) => {
        if (index === 0 || rawTurns[index - 1].role !== turn.role) bubble += 1;
        bubbleOfRaw.push(bubble);
    });

    const placed = new Map<number, VoiceCallToolCall[]>();
    for (const tool of toolCalls ?? []) {
        const after = Math.min(Math.max(Math.trunc(tool.afterTurn) || 0, 0), rawTurns.length);
        const at = after === 0 ? -1 : bubbleOfRaw[after - 1];
        placed.set(at, [...(placed.get(at) ?? []), tool]);
    }
    return placed;
}
