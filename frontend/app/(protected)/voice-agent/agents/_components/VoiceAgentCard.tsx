'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Bot, PhoneIncoming, PhoneOutgoing, PhoneOff, Trash2 } from 'lucide-react';
import { VoiceProvider, type VoiceAgent } from '@aixellabs/backend/db/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { voiceAgentVoiceCharacter, voiceAgentVoiceName } from '@/helpers/voice-agent-defaults';
import { voiceAgentUrl } from '@/helpers/voice-routes';
import { NumberProviderLogo } from '@/components/common/voice-agent/NumberProviderLogo';
import type { AgentPlace } from '../_hooks/use-voice-agents-page';
import { VoiceAgentCallTypeBadge } from './VoiceAgentCallTypeBadge';

type VoiceAgentCardProps = {
    agent: VoiceAgent;
    /** The numbers it works, and how. */
    places: AgentPlace[];
    /** Asks to delete it (the list confirms). */
    onDelete: () => void;
};

const JOB_WORDS: Record<AgentPlace['job'], string> = { answers: 'Answers', calls: 'Calls from', whatsapp: 'WhatsApp' };

/** "Answers +1 415…", "Calls from +91…", "WhatsApp +91…", or that it is on no number yet. */
function Places({ places }: { places: AgentPlace[] }) {
    if (places.length === 0) {
        return (
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <PhoneOff className="size-3.5" aria-hidden />
                Not on a number yet
            </p>
        );
    }
    return (
        <ul className="grid gap-1 text-xs" aria-label="Where it works" data-testid="agent-places">
            {places.map((place) => (
                <li key={`${place.job}-${place.phoneNumber}`} className="flex items-center gap-1.5">
                    {place.job === 'whatsapp' ? (
                        <NumberProviderLogo provider={VoiceProvider.WHATSAPP} className="size-3.5" />
                    ) : place.job === 'answers' ? (
                        <PhoneIncoming className="size-3.5 text-green-600" aria-hidden />
                    ) : (
                        <PhoneOutgoing className="size-3.5 text-blue-600" aria-hidden />
                    )}
                    {JOB_WORDS[place.job]} <span className="tabular-nums">{place.phoneNumber}</span>
                </li>
            ))}
        </ul>
    );
}

/** First non-heading line of the prompt, as a one-glance summary. */
function promptPreview(prompt: string): string {
    return prompt.split('\n').find((line) => line.trim() && !line.trimStart().startsWith('#')) ?? '';
}

export function VoiceAgentCard({ agent, places, onDelete }: VoiceAgentCardProps) {
    const character = voiceAgentVoiceCharacter(agent.voice);
    const preview = promptPreview(agent.prompt);

    // The delete button sits beside the link, not in it (a button inside a link is not valid HTML).
    return (
        <div className="relative" data-testid="voice-agent-card">
            <Link
                href={voiceAgentUrl(agent._id ?? '')}
                className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Open ${agent.name}`}
            >
                <Card className="h-full gap-3 transition-shadow hover:shadow-md">
                    <CardHeader className="flex flex-row items-start gap-3 pr-14">
                        <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                            <Bot className="size-5" />
                        </span>
                        <div className="min-w-0 space-y-1.5">
                            <CardTitle className="truncate">{agent.name}</CardTitle>
                            <div className="flex flex-wrap gap-1.5">
                                <VoiceAgentCallTypeBadge callType={agent.callType} />
                                <Badge variant="secondary">
                                    {voiceAgentVoiceName(agent.voice)}
                                    {character ? <span className="text-muted-foreground">· {character}</span> : null}
                                </Badge>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="grid flex-1 content-start gap-3">
                        <CardDescription className="line-clamp-2">
                            {preview || (
                                <span className="italic">No prompt yet. Open it to pick a template or write one.</span>
                            )}
                        </CardDescription>
                        <Places places={places} />
                    </CardContent>
                    <CardFooter className="text-muted-foreground text-xs" suppressHydrationWarning>
                        Updated {formatDistanceToNow(new Date(agent.updatedAt), { addSuffix: true })}
                    </CardFooter>
                </Card>
            </Link>
            <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive absolute top-3 right-3"
                aria-label={`Delete ${agent.name}`}
                onClick={onDelete}
            >
                <Trash2 className="size-4" />
            </Button>
        </div>
    );
}
