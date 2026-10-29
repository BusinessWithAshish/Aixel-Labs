'use client';

import { ExternalLink, KeyRound, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { VoiceKeyStatus } from '@aixellabs/backend/db/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePage } from '@/contexts/PageStore';
import type { UseContentLabSettingsPageReturn } from '../_hooks/use-content-lab-settings-page';

const AI_STUDIO_KEY_URL = 'https://aistudio.google.com/apikey';

function KeyStatus() {
    const { aiKey } = usePage<UseContentLabSettingsPageReturn>();
    const working = aiKey.set && aiKey.status === VoiceKeyStatus.OK;

    return (
        <div className="grid gap-1.5" data-testid="ai-key-status">
            {!aiKey.set ? (
                <Badge variant="secondary">No key yet</Badge>
            ) : working ? (
                <Badge variant="outline" className="border-transparent bg-green-500/15 text-green-700 dark:text-green-300">
                    Working · ends in {aiKey.last4}
                </Badge>
            ) : (
                <Badge variant="destructive">Google refused it · ends in {aiKey.last4}</Badge>
            )}
            {aiKey.set && !working && aiKey.statusMessage ? <p className="text-muted-foreground text-sm">{aiKey.statusMessage}</p> : null}
        </div>
    );
}

/** Content Lab's own Gemini key: drafts and rewrites run on it. Not shared with Voice agent. */
export function AiKeySection() {
    const page = usePage<UseContentLabSettingsPageReturn>();
    const { aiKey, keyBusy } = page;

    return (
        <Card className="h-auto gap-4" aria-labelledby="content-lab-ai-key">
            <CardHeader>
                <CardTitle id="content-lab-ai-key" className="flex items-center gap-2">
                    <KeyRound className="text-muted-foreground size-4" /> AI key
                </CardTitle>
                <CardDescription>
                    Content Lab writes drafts on your own Gemini API key. It is Content Lab&apos;s own key, separate from any key your voice agents use.
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
                <KeyStatus />
                <form
                    className="grid gap-1.5"
                    aria-label="Gemini API key"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void page.saveKey();
                    }}
                >
                    <Label htmlFor="content-lab-gemini-key">{aiKey.set ? 'Replace it with a new key' : 'Gemini API key'}</Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                            id="content-lab-gemini-key"
                            type="password"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="AIza…"
                            className="min-w-0 flex-1"
                            maxLength={200}
                            value={page.keyInput}
                            onChange={(event) => page.setKeyInput(event.target.value)}
                        />
                        <Button type="submit" disabled={!!keyBusy || !page.keyInput.trim()}>
                            {keyBusy === 'save' ? <Loader2 className="animate-spin" /> : null} {keyBusy === 'save' ? 'Checking with Google…' : 'Save key'}
                        </Button>
                    </div>
                    <p className="text-muted-foreground text-xs">
                        We check it with Google before saving, and keep it encrypted. The free tier works.{' '}
                        <a href={AI_STUDIO_KEY_URL} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 font-medium hover:underline">
                            Get a free key <ExternalLink className="size-3" />
                        </a>
                    </p>
                </form>
                {aiKey.set ? (
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" disabled={!!keyBusy} onClick={() => void page.recheckKey()}>
                            {keyBusy === 'check' ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check again
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={!!keyBusy}
                            onClick={() => void page.removeKey()}
                        >
                            {keyBusy === 'remove' ? <Loader2 className="animate-spin" /> : <Trash2 />} Remove key
                        </Button>
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
}
