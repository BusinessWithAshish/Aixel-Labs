'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeftRight, Check, CircleCheck, Loader2, Plug, RotateCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import { CalendarProviderLogo } from '../../../_components/CalendarProviderLogo';
import type { UseConnectedAppCallbackPageReturn } from '../_hooks/use-connected-app-callback-page';

type StepState = 'done' | 'active' | 'failed' | 'waiting';

const STEP_ICON = {
    done: <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />,
    active: <Loader2 className="text-muted-foreground size-3.5 animate-spin" />,
    failed: <X className="text-destructive size-3.5" />,
    waiting: <span className="bg-muted-foreground/40 size-1.5 rounded-full" />,
};

const TILE = 'bg-background flex size-14 items-center justify-center rounded-2xl border shadow-sm';

/**
 * The screen between the app's sign-in and the agent: Aixel Labs and the app side by side, what is happening
 * (signed in, checking access, back to the agent), then connected and back, or why not with a retry.
 */
export function ConnectedAppCallback() {
    const { provider, appLabel, back, backName, signedIn, error, done, retry, retrying } =
        usePage<UseConnectedAppCallbackPageReturn>();

    const steps: { label: string; state: StepState }[] = [
        { label: `Signed in with ${appLabel}`, state: signedIn ? 'done' : 'failed' },
        { label: 'Checking access', state: done ? 'done' : error ? (signedIn ? 'failed' : 'waiting') : 'active' },
        { label: `Back to ${backName}`, state: done ? 'active' : 'waiting' },
    ];

    return (
        <div className="flex min-h-[calc(100svh-7rem)] items-center justify-center px-1 py-6">
            <Card
                className="h-auto w-full max-w-md"
                role={error ? 'alert' : 'status'}
                data-testid={
                    error
                        ? 'connected-app-callback-error'
                        : done
                          ? 'connected-app-callback-done'
                          : 'connected-app-callback-pending'
                }
            >
                <CardContent className="grid grid-cols-[minmax(0,1fr)] justify-items-center gap-5 py-6 text-center">
                    <div className="flex items-center gap-3" aria-hidden>
                        <span className={TILE}>
                            <Image src="/aixellabs-logo.svg" alt="" width={32} height={32} className="size-8" />
                        </span>
                        <ArrowLeftRight className="text-muted-foreground size-5" />
                        <span className={TILE}>
                            {provider ? (
                                <CalendarProviderLogo provider={provider} className="size-8" />
                            ) : (
                                <Plug className="text-muted-foreground size-7" />
                            )}
                        </span>
                    </div>

                    <div className="grid gap-1.5">
                        <h1 className="flex items-center justify-center gap-2 text-xl font-semibold">
                            {done ? (
                                <CircleCheck className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            ) : null}
                            {error
                                ? `Couldn't connect ${appLabel}`
                                : done
                                  ? `${appLabel} connected`
                                  : `Connecting ${appLabel}…`}
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            {error ??
                                (done
                                    ? done.account
                                        ? `Signed in as ${done.account}.`
                                        : 'Your agent can use it now.'
                                    : `Checking access to your ${appLabel}. This takes a moment.`)}
                        </p>
                    </div>

                    <ol className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs" aria-label="Progress">
                        {steps.map((step) => (
                            <li
                                key={step.label}
                                className={cn(
                                    'flex items-center gap-1.5',
                                    step.state === 'waiting' ? 'text-muted-foreground' : 'text-foreground',
                                )}
                                data-state={step.state}
                            >
                                <span className="flex size-3.5 items-center justify-center">{STEP_ICON[step.state]}</span>
                                {step.label}
                            </li>
                        ))}
                    </ol>

                    {error ? (
                        <div className="flex flex-wrap justify-center gap-2">
                            {provider ? (
                                <Button type="button" onClick={() => void retry()} disabled={retrying}>
                                    {retrying ? (
                                        <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                        <RotateCw className="size-4" />
                                    )}
                                    Try again
                                </Button>
                            ) : null}
                            <Button asChild variant="outline" className="h-auto min-h-9 max-w-full whitespace-normal">
                                <Link href={back}>Back to {backName}</Link>
                            </Button>
                        </div>
                    ) : done ? (
                        <p className="text-muted-foreground text-sm">
                            Taking you back to {backName}…{' '}
                            <Link
                                href={done.href}
                                replace
                                className="text-primary font-medium underline-offset-4 hover:underline"
                            >
                                Go now
                            </Link>
                        </p>
                    ) : null}
                </CardContent>
            </Card>
        </div>
    );
}
