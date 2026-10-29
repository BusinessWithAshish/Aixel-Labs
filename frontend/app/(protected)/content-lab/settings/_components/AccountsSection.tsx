'use client';

import { useState } from 'react';
import { CircleAlert, Link2, Loader2, LockKeyhole, RotateCw, Unlink, UserRound } from 'lucide-react';
import {
    CONTENT_LAB_BETA_PLATFORMS,
    CONTENT_LAB_CONNECT_PLATFORMS,
    ContentLabConnectionStatus,
    type ContentLabConnectPlatform,
} from '@aixellabs/backend/db/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePage } from '@/contexts/PageStore';
import { CONTENT_LAB_PLATFORM_LABELS } from '../../_constants';
import { CreatorAvatar } from '../../_components/CreatorAvatar';
import { PlatformIcon } from '../../_components/PlatformIcon';
import { compactNumber } from '../../search/_utils/format';
import type { UseContentLabSettingsPageReturn } from '../_hooks/use-content-lab-settings-page';

/** What signing in with each platform needs, in a line. */
const SIGN_IN_NOTE: Record<ContentLabConnectPlatform, string> = {
    youtube: 'Sign in with the Google account that owns your channel.',
    instagram: 'Needs an Instagram business or creator account.',
};

function HandleInput({ platform, group, id }: { platform: string; group: 'handles' | 'betaHandles'; id: string }) {
    const page = usePage<UseContentLabSettingsPageReturn>();
    return (
        <Input
            id={id}
            placeholder="@yourhandle"
            maxLength={200}
            value={(page.form[group] as Record<string, string | undefined>)[platform] ?? ''}
            onChange={(event) => page.setHandle(group, platform, event.target.value)}
        />
    );
}

/** One platform: the connected account, or a Connect button with a public-handle fallback. */
function AccountTile({ platform }: { platform: ContentLabConnectPlatform }) {
    const page = usePage<UseContentLabSettingsPageReturn>();
    const label = CONTENT_LAB_PLATFORM_LABELS[platform];
    const connection = page.connectionFor(platform);
    const active = connection?.status === ContentLabConnectionStatus.ACTIVE ? connection : null;
    const account = active?.account ?? null;
    const typedHandle = !!page.form.handles[platform];
    const [showHandle, setShowHandle] = useState(typedHandle || !page.composioReady);
    const connecting = page.connecting === platform;
    const inputId = `handle-${platform}`;

    return (
        <div className="bg-card flex min-w-0 flex-col gap-4 rounded-xl border p-4" data-testid={`account-${platform}`}>
            <div className="flex items-center gap-2">
                <PlatformIcon platform={platform} className="size-5" />
                <h4 className="font-medium">{label}</h4>
                {active ? (
                    <Badge variant="outline" className="ml-auto border-transparent bg-green-500/15 text-green-700 dark:text-green-300">
                        Connected
                    </Badge>
                ) : connection ? (
                    <Badge variant="destructive" className="ml-auto">
                        Needs connecting again
                    </Badge>
                ) : null}
            </div>

            {active ? (
                <>
                    <div className="flex min-w-0 items-center gap-3">
                        <CreatorAvatar name={account?.name} handle={account?.handle} avatarUrl={account?.avatarUrl} className="size-12" />
                        <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold">{account?.name ?? (account?.handle ? `@${account.handle}` : label)}</p>
                            {account?.handle ? (
                                account.url ? (
                                    <a href={account.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground block truncate text-sm">
                                        @{account.handle}
                                    </a>
                                ) : (
                                    <p className="text-muted-foreground truncate text-sm">@{account.handle}</p>
                                )
                            ) : null}
                            {account?.followers != null ? (
                                <p className="text-sm">
                                    <span className="font-semibold tabular-nums">{compactNumber(account.followers)}</span>{' '}
                                    <span className="text-muted-foreground">followers</span>
                                </p>
                            ) : null}
                        </div>
                    </div>
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                        <LockKeyhole className="size-3.5 shrink-0" /> Read only. We never post or change anything.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" disabled={connecting} onClick={() => void page.connect(platform)}>
                            {connecting ? <Loader2 className="animate-spin" /> : <RotateCw />} Reconnect
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={page.disconnecting === active._id}
                            onClick={() => void page.disconnect(active)}
                        >
                            {page.disconnecting === active._id ? <Loader2 className="animate-spin" /> : <Unlink />} Disconnect
                        </Button>
                    </div>
                </>
            ) : (
                <>
                    {connection?.statusReason ? (
                        <p className="text-muted-foreground flex items-start gap-1.5 text-sm">
                            <CircleAlert className="text-destructive mt-0.5 size-4 shrink-0" /> {connection.statusReason}
                        </p>
                    ) : null}
                    {page.composioReady ? (
                        <div className="grid gap-1.5">
                            <Button type="button" className="w-full sm:w-fit" disabled={connecting} onClick={() => void page.connect(platform)}>
                                {connecting ? <Loader2 className="animate-spin" /> : <Link2 />}
                                {connecting ? `Connecting ${label}…` : connection ? `Reconnect ${label}` : `Connect ${label}`}
                            </Button>
                            <p className="text-muted-foreground text-xs">{SIGN_IN_NOTE[platform]} Read only.</p>
                        </div>
                    ) : (
                        <p className="text-muted-foreground text-sm">Connecting accounts is not available here yet. Enter your public handle instead.</p>
                    )}
                    {showHandle ? (
                        <div className="grid gap-1.5">
                            <Label htmlFor={inputId}>{page.composioReady ? `Or your public ${label} handle` : `${label} handle`}</Label>
                            <HandleInput platform={platform} group="handles" id={inputId} />
                        </div>
                    ) : (
                        <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground w-fit text-sm underline underline-offset-4"
                            onClick={() => setShowHandle(true)}
                        >
                            or enter a public handle
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

/** Your own accounts: connected YouTube and Instagram (Your tone reads their posts), plus X and LinkedIn handles in beta. */
export function AccountsSection() {
    const page = usePage<UseContentLabSettingsPageReturn>();

    return (
        <Card className="h-auto gap-4" aria-labelledby="content-lab-accounts">
            <CardHeader>
                <CardTitle id="content-lab-accounts" className="flex items-center gap-2">
                    <UserRound className="text-muted-foreground size-4" /> Your accounts
                </CardTitle>
                <CardDescription>Connect your own accounts so the Your tone node learns how you write from your recent posts.</CardDescription>
            </CardHeader>
            <CardContent>
                <form
                    className="grid gap-5"
                    aria-label="Your accounts"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void page.save();
                    }}
                >
                    <div className="grid gap-4 md:grid-cols-2">
                        {CONTENT_LAB_CONNECT_PLATFORMS.map((platform) => (
                            <AccountTile key={platform} platform={platform} />
                        ))}
                    </div>
                    <div className="grid gap-3">
                        <p className="flex items-center gap-2 text-sm font-medium">
                            More platforms <Badge variant="secondary">Beta</Badge>
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {CONTENT_LAB_BETA_PLATFORMS.map((platform) => (
                                <div key={platform} className="grid gap-1.5">
                                    <Label htmlFor={`handle-${platform}`} className="flex items-center gap-2">
                                        <PlatformIcon platform={platform} />
                                        {CONTENT_LAB_PLATFORM_LABELS[platform]}
                                    </Label>
                                    <HandleInput platform={platform} group="betaHandles" id={`handle-${platform}`} />
                                </div>
                            ))}
                        </div>
                        <p className="text-muted-foreground text-xs">X and LinkedIn handles are saved now and used once those platforms leave beta.</p>
                    </div>
                    <Button type="submit" className="w-fit" disabled={page.saving}>
                        {page.saving ? <Loader2 className="animate-spin" /> : null} Save handles
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
