import { endedByLabel, endedByTone, TONE_COLORS } from '@/helpers/voice-call-outcomes';

/** How the call ended, after a dot in the colour Analytics' "How calls ended" gives it. */
export function CallEndedBy({ endedBy }: { endedBy: string }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: TONE_COLORS[endedByTone(endedBy)] }}
                aria-hidden
            />
            {endedByLabel(endedBy)}
        </span>
    );
}
