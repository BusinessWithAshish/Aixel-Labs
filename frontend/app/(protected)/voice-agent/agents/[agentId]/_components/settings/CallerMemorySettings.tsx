'use client';

import { useState } from 'react';
import { BrainCircuit, Loader2 } from 'lucide-react';
import { VOICE_AGENT_FEATURE_LIMITS, type VoiceCallerMemory } from '@aixellabs/backend/db/types';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SettingsSection } from '@/components/common/SettingsSection';
import { usePage } from '@/contexts/PageStore';
import { formatDay } from '@/helpers/voice-time';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';

/** Caller memory: on/off, and the callers it remembers, each of whom can be forgotten. */
export function CallerMemorySettings() {
    const { settingsDraft, setSettings, savingSettings, memories, forgetting, forgetCaller, forgetEveryone } =
        usePage<UseVoiceAgentEditorPageReturn>();
    const [confirm, setConfirm] = useState<VoiceCallerMemory | 'all' | null>(null);

    const onConfirm = async () => {
        const done = confirm === 'all' ? await forgetEveryone() : confirm ? await forgetCaller(confirm) : false;
        if (done) setConfirm(null);
    };

    return (
        <SettingsSection
            titleId="memory-title"
            icon={BrainCircuit}
            title={
                <Label htmlFor="memory-enabled" className="text-base font-medium">
                    Remember callers
                </Label>
            }
            description={`After each phone call, a short note on the person (up to ${VOICE_AGENT_FEATURE_LIMITS.memoryBriefMax} characters) is kept under their number. The next time this agent talks with that number, it starts with the note and the date of the last call. Only this agent sees it.`}
            action={
                <Switch
                    id="memory-enabled"
                    checked={settingsDraft.memory}
                    onCheckedChange={(memory) => setSettings({ memory })}
                    disabled={savingSettings}
                    className="mt-1"
                />
            }
            data-testid="memory-settings"
        >
            {memories.total > 0 ? (
                <div className="grid gap-2" data-testid="memory-list">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                            Remembers {memories.total} {memories.total === 1 ? 'caller' : 'callers'}
                            {memories.total > memories.memories.length ? ` (latest ${memories.memories.length} shown)` : ''}
                        </p>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive h-7"
                            onClick={() => setConfirm('all')}
                            disabled={forgetting !== null}
                        >
                            Forget everyone
                        </Button>
                    </div>
                    <ul className="divide-y rounded-md border">
                        {memories.memories.map((memory) => (
                            <li key={memory._id} className="grid gap-1 px-3 py-2" data-testid="memory-row">
                                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                    <span className="text-sm font-medium tabular-nums">{memory.phone}</span>
                                    <span className="text-muted-foreground flex items-center gap-2 text-xs">
                                        <span suppressHydrationWarning>
                                            Last call {formatDay(memory.lastCallAt)} ·{' '}
                                            {memory.calls === 1 ? '1 call' : `${memory.calls} calls`}
                                        </span>
                                        <Button
                                            type="button"
                                            variant="link"
                                            size="sm"
                                            className="text-destructive h-auto p-0 text-xs"
                                            onClick={() => setConfirm(memory)}
                                            disabled={forgetting !== null}
                                            aria-label={`Forget ${memory.phone}`}
                                        >
                                            {forgetting === memory._id ? <Loader2 className="size-3 animate-spin" /> : null}
                                            Forget
                                        </Button>
                                    </span>
                                </div>
                                <p className="text-muted-foreground line-clamp-2 text-xs break-words">{memory.brief}</p>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : settingsDraft.memory ? (
                <p className="text-muted-foreground text-xs">No callers remembered yet.</p>
            ) : null}

            <ConfirmDialog
                open={confirm !== null}
                onOpenChange={(open) => !open && forgetting === null && setConfirm(null)}
                title={confirm === 'all' ? 'Forget every caller?' : `Forget ${confirm?.phone ?? 'this caller'}?`}
                alertMessage={
                    confirm === 'all'
                        ? 'The agent starts its next call with each of these numbers knowing nothing about them. Call logs stay.'
                        : 'The agent starts its next call with this number knowing nothing about them. Call logs stay.'
                }
                confirmText={confirm === 'all' ? 'Forget everyone' : 'Forget caller'}
                onConfirm={() => void onConfirm()}
                isLoading={forgetting !== null}
            />
        </SettingsSection>
    );
}
