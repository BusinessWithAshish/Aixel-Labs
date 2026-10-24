'use client';

import Link from 'next/link';
import { Bot, Clock, Delete, Grid3x3, Phone, PhoneOff } from 'lucide-react';
import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import { usePage } from '@/contexts/PageStore';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SubModuleUrls } from '@/config/app-config';
import { formatDuration } from '@/helpers/voice-call-format';
import { formatMoney } from '@/helpers/voice-call-cost';
import { countryOfE164 } from '@/helpers/voice-campaign-contacts';
import { cn } from '@/lib/utils';
import { ROUND_BUTTON } from '../_utils/constants';
import { displayNumber } from '../_utils/web-dialer';
import { AgentsList } from './AgentsList';
import { Dialpad } from './Dialpad';
import { FromNumber } from './FromNumber';
import { InCallScreen } from './InCallScreen';
import { PhoneDisplay } from './PhoneDisplay';
import { PhoneFrame } from './PhoneFrame';
import { Recents } from './Recents';
import type { UseWebDialerPageReturn } from '../_hooks/use-web-dialer-page';

const TAB_TRIGGER =
    'h-auto flex-col gap-0.5 rounded-none border-0 py-1.5 text-[0.6875rem] text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none dark:text-muted-foreground dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-primary [&_svg:not([class*="size-"])]:size-6';

/** The keypad tab: the number, what it costs, the keys, Call. */
function Keypad() {
    const page = usePage<UseWebDialerPageReturn>();
    const { number, dialed, to, usdPerMinute, finished, error } = page;
    const currency = useDisplayCurrency();

    const country = to ? countryOfE164(to) : null;
    const hint =
        finished && !error
            ? `Call ended${finished.seconds ? ` · ${formatDuration(finished.seconds)}` : ''}${finished.usd !== null ? ` · about ${formatMoney(finished.usd, currency)}` : ''}`
            : !dialed
              ? null
              : !to
                ? 'Start with the country code, like +1 or +91'
                : [country?.name, usdPerMinute !== null && `about ${formatMoney(usdPerMinute, currency)} a minute`]
                      .filter(Boolean)
                      .join(' · ');
    const warning =
        error ??
        (page.micBlocked
            ? 'Your browser blocks the microphone here. Allow it from the icon at the left of the address bar.'
            : null);

    return (
        <div className="flex flex-1 flex-col items-center gap-3 px-4 pt-2 pb-3">
            <div className="w-full space-y-0.5 text-center">
                <PhoneDisplay value={displayNumber(dialed)} onChange={page.setDialed} onEnter={page.call} />
                <p className="text-muted-foreground min-h-5 text-sm" data-testid="web-dialer-hint">
                    {hint}
                </p>
                {warning ? (
                    <p
                        role="alert"
                        data-testid="web-dialer-warning"
                        className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}
                    >
                        {warning}
                    </p>
                ) : null}
            </div>

            <div className="mt-auto flex flex-col items-center gap-3.5">
                <Dialpad onButtonClick={page.pressKey} onLongPress={() => page.pressKey('+')} />
                <div className="grid grid-cols-3 items-center justify-items-center gap-x-6">
                    <span />
                    <Button
                        onClick={page.call}
                        disabled={!number || !!number.problem || !dialed.trim()}
                        aria-label="Call"
                        className={cn(ROUND_BUTTON, 'bg-green-500 text-white hover:bg-green-600')}
                    >
                        <Phone className="fill-current" />
                    </Button>
                    {dialed ? (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={page.backspace}
                            aria-label="Delete last digit"
                            className="text-muted-foreground size-12 rounded-full [&_svg:not([class*='size-'])]:size-6"
                        >
                            <Delete />
                        </Button>
                    ) : null}
                </div>
                <p className="text-muted-foreground text-xs">Long-press 0 for +</p>
            </div>
        </div>
    );
}

/** Call from one of your numbers, in the browser, on an iPhone-like phone. */
export function WebDialerContent() {
    const page = usePage<UseWebDialerPageReturn>();
    const inCall = page.phase !== 'idle';

    if (page.numbers.length === 0) {
        return (
            <PhoneFrame>
                <EmptyState
                    className="flex-1 border-0"
                    icon={<PhoneOff />}
                    title="No phone number yet"
                    description={page.error ?? 'Calls go out from one of your numbers. Connect one first.'}
                >
                    <Button asChild>
                        <Link href={SubModuleUrls[VOICE_AGENT_SUB_MODULES.PHONE_NUMBERS]}>Connect a number</Link>
                    </Button>
                </EmptyState>
            </PhoneFrame>
        );
    }

    return (
        <PhoneFrame classNames={{ screen: cn(inCall && 'dark') }}>
            {inCall ? (
                <InCallScreen />
            ) : (
                <>
                    <FromNumber />
                    <Tabs
                        value={page.tab}
                        onValueChange={(tab) => page.setTab(tab as typeof page.tab)}
                        className="min-h-0 flex-1 gap-0"
                    >
                        <TabsContent value="keypad" className="flex flex-col">
                            <Keypad />
                        </TabsContent>
                        <TabsContent value="agents" className="overflow-y-auto">
                            <AgentsList />
                        </TabsContent>
                        <TabsContent value="recents" className="overflow-y-auto">
                            <Recents />
                        </TabsContent>
                        <TabsList className="bg-background h-auto w-full rounded-none border-t p-0 pt-1">
                            <TabsTrigger value="keypad" className={TAB_TRIGGER}>
                                <Grid3x3 />
                                Keypad
                            </TabsTrigger>
                            <TabsTrigger value="agents" className={TAB_TRIGGER}>
                                <Bot />
                                Agents
                            </TabsTrigger>
                            <TabsTrigger value="recents" className={TAB_TRIGGER}>
                                <Clock />
                                Recents
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </>
            )}
        </PhoneFrame>
    );
}
