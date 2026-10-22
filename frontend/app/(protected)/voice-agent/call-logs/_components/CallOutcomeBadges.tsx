import { CircleCheck, CircleX } from 'lucide-react';
import type { VoiceCallAnalysis } from '@aixellabs/backend/db/types';
import { Badge } from '@/components/ui/badge';
import { SENTIMENT_LABELS, sentimentVariant } from '@/helpers/voice-call-format';

/** The analysis' verdicts on a call: whether it succeeded, and the caller's sentiment. Nothing when not analysed. */
export function CallOutcomeBadges({ analysis }: { analysis: VoiceCallAnalysis | null | undefined }) {
    if (!analysis || analysis.error) return null;
    const { successful, sentiment } = analysis;
    return (
        <>
            {typeof successful === 'boolean' ? (
                <Badge variant={successful ? 'green' : 'red'} data-testid="call-success">
                    {successful ? <CircleCheck aria-hidden /> : <CircleX aria-hidden />}
                    {successful ? 'Successful' : 'Not successful'}
                </Badge>
            ) : null}
            {sentiment ? (
                <Badge variant={sentimentVariant(sentiment)} data-testid="call-sentiment">
                    {SENTIMENT_LABELS[sentiment]}
                </Badge>
            ) : null}
        </>
    );
}
