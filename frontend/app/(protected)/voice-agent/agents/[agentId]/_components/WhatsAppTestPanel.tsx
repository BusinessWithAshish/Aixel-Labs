'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { sendTestChatMessage, type TestChatTurn } from '@/app/actions/voice-agent-actions';
import { Button } from '@/components/ui/button';
import {
    WhatsAppBubble,
    WhatsAppComposer,
    WhatsAppFrame,
    WhatsAppPill,
    whatsappTime,
} from '@/components/common/voice-agent/whatsapp/WhatsAppChat';

type Line =
    | (TestChatTurn & { kind: 'message'; at: string })
    | { kind: 'note'; text: string; at: string };

/**
 * Chat with the agent as a customer would on WhatsApp: the saved agent answers in the engine exactly as on a WhatsApp
 * number (its prompt, tools, chat model, hand-off), on your own key. Nothing is stored; a booking is a playground one.
 */
export function WhatsAppTestPanel({ agentId, agentName }: { agentId: string; agentName: string }) {
    const [lines, setLines] = useState<Line[]>([]);
    const [draft, setDraft] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const send = async () => {
        const text = draft.trim();
        if (!text) return;
        const at = new Date().toISOString();
        const next: Line[] = [...lines, { kind: 'message', role: 'caller', text, at }];
        setLines(next);
        setDraft('');
        setSending(true);
        setError(null);
        const turns = next.filter((l): l is Extract<Line, { kind: 'message' }> => l.kind === 'message').map(({ role, text }) => ({ role, text }));
        const res = await sendTestChatMessage(agentId, turns);
        setSending(false);
        if (!res.success || !res.data) {
            setError(res.error ?? 'The agent could not answer');
            return;
        }
        const now = new Date().toISOString();
        const notes: Line[] = res.data.toolCalls.map((t) => ({ kind: 'note', text: `${t.ok ? '✓' : '✗'} ${t.name}: ${t.result}`, at: now }));
        if (res.data.handoff) {
            notes.push({ kind: 'note', text: `Handed to a person (${res.data.handoff}). On a real number this chat shows as Waiting in the WhatsApp inbox, and the AI goes quiet.`, at: now });
        }
        setLines((current) => [...current, ...notes, { kind: 'message', role: 'agent', text: res.data!.reply, at: now }]);
    };

    return (
        <div className="grid gap-3">
            <WhatsAppFrame
                className="h-[26rem]"
                scrollKey={lines.length}
                title={agentName}
                subtitle={sending ? 'typing…' : 'Test chat · nothing is sent or stored'}
                actions={
                    lines.length ? (
                        <Button
                            size="icon"
                            variant="ghost"
                            className="text-white hover:bg-white/10 hover:text-white"
                            onClick={() => setLines([])}
                            aria-label="Start over"
                        >
                            <RotateCcw className="size-4" aria-hidden />
                        </Button>
                    ) : null
                }
                footer={<WhatsAppComposer value={draft} onChange={setDraft} onSend={() => void send()} sending={sending} placeholder="Message the agent" />}
            >
                {lines.length === 0 ? (
                    <WhatsAppPill>Write as a customer would. The agent answers like it does on your WhatsApp number.</WhatsAppPill>
                ) : null}
                {lines.map((line, i) =>
                    line.kind === 'note' ? (
                        <WhatsAppPill key={i} className="max-w-[85%] text-left">
                            {line.text}
                        </WhatsAppPill>
                    ) : (
                        <WhatsAppBubble
                            key={i}
                            side={line.role === 'caller' ? 'in' : 'out'}
                            text={line.text}
                            time={whatsappTime(line.at)}
                            tail={i === 0 || lines[i - 1].kind !== 'message' || (lines[i - 1] as TestChatTurn).role !== line.role}
                        />
                    ),
                )}
            </WhatsAppFrame>
            {error ? (
                <p className="text-destructive text-sm" role="alert">
                    {error}
                </p>
            ) : null}
        </div>
    );
}
