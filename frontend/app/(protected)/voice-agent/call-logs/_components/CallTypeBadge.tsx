import type { VoiceCallChannel, VoiceCallDirection } from '@aixellabs/backend/db/types';
import { Badge } from '@/components/ui/badge';
import { callTypeLabel, callTypeVariant } from '@/helpers/voice-call-format';

/** Playground, Inbound or Outbound, coloured as everywhere in Call logs. */
export function CallTypeBadge({ channel, direction }: { channel: VoiceCallChannel; direction: VoiceCallDirection }) {
    return <Badge variant={callTypeVariant(channel, direction)}>{callTypeLabel(channel, direction)}</Badge>;
}
