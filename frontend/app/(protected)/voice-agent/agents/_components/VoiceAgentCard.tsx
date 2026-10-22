'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Bot } from 'lucide-react';
import type { VoiceAgent } from '@aixellabs/backend/db/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { voiceAgentVoiceCharacter, voiceAgentVoiceName } from '@/helpers/voice-agent-defaults';
import { voiceAgentUrl } from '@/helpers/voice-routes';
import { VoiceAgentCallTypeBadge } from './VoiceAgentCallTypeBadge';

type VoiceAgentCardProps = {
    agent: VoiceAgent;
};

/** First non-heading line of the prompt, as a one-glance summary. */
function promptPreview(prompt: string): string {
    return prompt.split('\n').find((line) => line.trim() && !line.trimStart().startsWith('#')) ?? '';
}

export function VoiceAgentCard({ agent }: VoiceAgentCardProps) {
    const character = voiceAgentVoiceCharacter(agent.voice);
    const preview = promptPreview(agent.prompt);

    return (
        <Link
            href={voiceAgentUrl(agent._id ?? '')}
            className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Open ${agent.name}`}
        >
            <Card className="h-full gap-3 transition-shadow hover:shadow-md" data-testid="voice-agent-card">
                <CardHeader className="flex flex-row items-start gap-3">
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
                <CardContent className="flex-1">
                    <CardDescription className="line-clamp-2">
                        {preview || <span className="italic">No prompt yet. Open it to pick a template or write one.</span>}
                    </CardDescription>
                </CardContent>
                <CardFooter className="text-muted-foreground text-xs" suppressHydrationWarning>
                    Updated {formatDistanceToNow(new Date(agent.updatedAt), { addSuffix: true })}
                </CardFooter>
            </Card>
        </Link>
    );
}
