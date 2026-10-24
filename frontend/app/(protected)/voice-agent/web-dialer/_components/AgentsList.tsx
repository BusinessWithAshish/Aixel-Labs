import { Bot, Loader2, Phone } from 'lucide-react';
import { usePage } from '@/contexts/PageStore';
import { formatPhone } from '@/helpers/voice-campaign-contacts';
import type { UseWebDialerPageReturn } from '../_hooks/use-web-dialer-page';

/** Agents that answer a Telnyx number: tap one to call it the way a customer would, over the internet. */
export function AgentsList() {
    const { agents, callAgent } = usePage<UseWebDialerPageReturn>();

    return (
        <div className="flex flex-col">
            <h2 className="px-4 pt-3 pb-1 text-2xl font-bold">Agents</h2>
            <p className="text-muted-foreground px-4 pb-2 text-xs">
                Call an agent as a customer would. No phone network, so it works from any country.
            </p>
            {agents === null ? (
                <Loader2 className="text-muted-foreground mx-auto my-10 size-5 animate-spin" />
            ) : agents.length === 0 ? (
                <p className="text-muted-foreground px-4 py-10 text-center text-sm">No agent answers a Telnyx number yet</p>
            ) : (
                <ul className="divide-y border-y" aria-label="Agents">
                    {agents.map((agent) => (
                        <li key={`${agent.id}-${agent.numberId}`}>
                            <button
                                type="button"
                                onClick={() => void callAgent(agent)}
                                disabled={!!agent.blocked}
                                title={agent.blocked ?? undefined}
                                className="hover:bg-muted/60 focus-visible:bg-muted/60 flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent"
                            >
                                <Bot className="text-muted-foreground size-5 shrink-0" aria-hidden />
                                <span className="flex min-w-0 flex-1 flex-col">
                                    <span className="truncate font-medium">{agent.name}</span>
                                    <span className="text-muted-foreground text-xs tabular-nums">
                                        Answers {formatPhone(agent.phoneNumber)}
                                    </span>
                                    {agent.blocked ? (
                                        <span
                                            className="text-xs text-amber-700 dark:text-amber-400"
                                            data-testid="agent-blocked"
                                        >
                                            {agent.blocked}
                                        </span>
                                    ) : null}
                                </span>
                                {agent.blocked ? null : (
                                    <Phone className="text-primary size-4" aria-label={`Call ${agent.name}`} />
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
