import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { VoiceCallBlocker } from '@/helpers/voice-call-readiness';

/** Why the agent cannot take or make calls yet, each reason with the way to fix it. Nothing when it can. */
export function CallBlockers({ blockers, className }: { blockers: VoiceCallBlocker[]; className?: string }) {
    if (!blockers.length) return null;
    return (
        <Alert variant="warning" className={className} data-testid="call-blockers">
            <TriangleAlert className="size-4" aria-hidden />
            <AlertTitle>It can&rsquo;t take or make calls yet</AlertTitle>
            <AlertDescription>
                <ul className="grid gap-1 text-xs">
                    {blockers.map((b) => (
                        <li key={b.message}>
                            {b.message}{' '}
                            <Link href={b.href} className="font-medium whitespace-nowrap underline underline-offset-4">
                                {b.fix} &rarr;
                            </Link>
                        </li>
                    ))}
                </ul>
            </AlertDescription>
        </Alert>
    );
}
