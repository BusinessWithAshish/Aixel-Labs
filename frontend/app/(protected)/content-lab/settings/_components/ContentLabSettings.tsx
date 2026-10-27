'use client';

import Link from 'next/link';
import { Globe, KeyRound, Loader2, UserRound } from 'lucide-react';
import { CONTENT_LAB_PLATFORMS } from '@aixellabs/backend/content-lab/constants';
import { CONTENT_LAB_BETA_PLATFORMS, VoiceKeyStatus } from '@aixellabs/backend/db/types';
import { SettingsSection } from '@/components/common/SettingsSection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { usePage } from '@/contexts/PageStore';
import { GEMINI_KEY_URL } from '@/helpers/voice-routes';
import { CONTENT_LAB_COUNTRIES, CONTENT_LAB_LANGUAGES, CONTENT_LAB_PLATFORM_LABELS } from '../../_constants';
import type { UseContentLabSettingsPageReturn } from '../_hooks/use-content-lab-settings-page';

const ACCOUNT_ROWS = [
    ...CONTENT_LAB_PLATFORMS.map((platform) => ({ platform, group: 'handles' as const, beta: false })),
    ...CONTENT_LAB_BETA_PLATFORMS.map((platform) => ({ platform, group: 'betaHandles' as const, beta: true })),
];

function GeminiKeyStatusLine() {
    const { geminiKey } = usePage<UseContentLabSettingsPageReturn>();
    const working = geminiKey.set && geminiKey.status === VoiceKeyStatus.OK;

    return (
        <div className="flex flex-wrap items-center gap-3" data-testid="gemini-key-status">
            {!geminiKey.set ? (
                <Badge variant="secondary">No key yet</Badge>
            ) : working ? (
                <Badge variant="outline" className="border-transparent bg-green-500/15 text-green-700 dark:text-green-300">
                    Working · ends in {geminiKey.last4}
                </Badge>
            ) : (
                <Badge variant="destructive">Google refused it</Badge>
            )}
            {geminiKey.set && !working && geminiKey.statusMessage ? (
                <p className="text-muted-foreground w-full text-sm">{geminiKey.statusMessage}</p>
            ) : null}
            <Button asChild variant="outline" size="sm">
                <Link href={GEMINI_KEY_URL}>{geminiKey.set ? 'Change it in Voice agent settings' : 'Add it in Voice agent settings'}</Link>
            </Button>
        </div>
    );
}

export function ContentLabSettings() {
    const page = usePage<UseContentLabSettingsPageReturn>();
    const { form } = page;

    return (
        <Card className="h-auto max-w-3xl">
            <CardContent className="grid gap-5">
                <form
                    className="grid gap-5"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void page.save();
                    }}
                >
                    <SettingsSection
                        titleId="content-lab-accounts"
                        icon={UserRound}
                        title="Your accounts"
                        description="Public handles, no login. My voice boxes learn your tone from your recent posts."
                    >
                        <div className="grid gap-3 sm:grid-cols-2">
                            {ACCOUNT_ROWS.map(({ platform, group, beta }) => {
                                const id = `handle-${platform}`;
                                return (
                                    <div key={platform} className="grid gap-1.5">
                                        <Label htmlFor={id} className="flex items-center gap-2">
                                            {CONTENT_LAB_PLATFORM_LABELS[platform]}
                                            {beta ? <Badge variant="secondary">Beta</Badge> : null}
                                        </Label>
                                        <Input
                                            id={id}
                                            placeholder="@yourhandle"
                                            maxLength={200}
                                            value={(form[group] as Record<string, string | undefined>)[platform] ?? ''}
                                            onChange={(event) => page.setHandle(group, platform, event.target.value)}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        <p className="text-muted-foreground text-xs">X and LinkedIn are saved now and used once they leave beta.</p>
                    </SettingsSection>

                    <Separator />

                    <SettingsSection
                        titleId="content-lab-defaults"
                        icon={Globe}
                        title="Defaults"
                        description="New boards start with this country for results and this language for drafts."
                    >
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="grid gap-1.5">
                                <Label htmlFor="default-country">Country</Label>
                                <Select value={form.country} onValueChange={page.setCountry}>
                                    <SelectTrigger id="default-country" className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CONTENT_LAB_COUNTRIES.map(({ code, label }) => (
                                            <SelectItem key={code} value={code}>
                                                {label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="default-language">Language</Label>
                                <Select value={form.language} onValueChange={page.setLanguage}>
                                    <SelectTrigger id="default-language" className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CONTENT_LAB_LANGUAGES.map((language) => (
                                            <SelectItem key={language} value={language}>
                                                {language}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </SettingsSection>

                    <Button type="submit" className="w-fit" disabled={page.saving}>
                        {page.saving ? <Loader2 className="animate-spin" /> : null} Save settings
                    </Button>
                </form>

                <Separator />

                <SettingsSection
                    titleId="content-lab-ai-key"
                    icon={KeyRound}
                    title="AI key"
                    description="Content Lab writes drafts on your own Gemini API key, the same one your voice agents use."
                >
                    <GeminiKeyStatusLine />
                </SettingsSection>
            </CardContent>
        </Card>
    );
}
