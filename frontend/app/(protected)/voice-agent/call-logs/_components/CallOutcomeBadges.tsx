import { CircleCheck, CircleX } from 'lucide-react';
import type { VoiceCallAnalysis } from '@aixellabs/backend/db/types';
import { Badge } from '@/components/ui/badge';
import { SENTIMENT_LABELS } from '@/helpers/voice-call-format';
import { sentimentTone, TONE_BADGES } from '@/helpers/voice-call-outcomes';

/** The analysis' verdicts on a call: whether it succeeded, and the caller's sentiment. Nothing when not analysed. */
export function CallOutcomeBadges({ analysis }: { analysis: VoiceCallAnalysis | null | undefined }) {
    if (!analysis || analysis.error) return null;
    const { successful, sentiment } = analysis;
    return (
        <>
            {typeof successful === 'boolean' ? (
                <Badge variant={TONE_BADGES[successful ? 'good' : 'bad']} data-testid="call-success">
                    {successful ? <CircleCheck aria-hidden /> : <CircleX aria-hidden />}
                    {successful ? 'Successful' : 'Not successful'}
                </Badge>
            ) : null}
            {sentiment ? (
                <Badge variant={TONE_BADGES[sentimentTone(sentiment)]} data-testid="call-sentiment">
                    {SENTIMENT_LABELS[sentiment]}
                </Badge>
            ) : null}
        </>
    );
}
