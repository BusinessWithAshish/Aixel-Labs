'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProgressRouter } from '@/hooks/use-progress-router';
import { type FieldValues, useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
    VOICE_BUILTIN_VARIABLES,
    type VoiceAgent,
    VoiceAgentCallType,
    type VoiceBookingDestination,
    type VoiceCalendarConnection,
    VoiceCalendarConnectionStatus,
    type VoiceCalendarProvider,
    type VoiceCallerMemory,
    type VoiceGeminiKeyView,
    type VoiceStack,
    VOICE_DEFAULT_STACK,
    voiceKeyFor,
    VoiceKeyProvider,
    VoiceStackKind,
} from '@aixellabs/backend/db/types';
import type { ALApiResponse } from '@aixellabs/backend/api/types';
import {
    deleteVoiceAgent,
    saveVoiceAgentBooking,
    saveVoiceAgentCallSettings,
    updateVoiceAgent,
    type VoiceAgentUsage,
} from '@/app/actions/voice-agent-actions';
import type { VoiceAgentCostTotals } from '@/app/actions/voice-call-actions';
import type { VoiceAgentStackOptions } from '@/app/actions/voice-settings-actions';
import { setNumberAgent, unlinkAgentNumber, type VoiceNumberListItem } from '@/app/actions/voice-number-actions';
import { estimateAgentCost } from '@/helpers/voice-call-cost';
import { voiceCallBlockers } from '@/helpers/voice-call-readiness';
import { channelOf } from '@/helpers/voice-agent-channels';
import {
    disconnectVoiceApp,
    listVoiceAppCalendars,
    startVoiceAppConnection,
    type VoiceConnectedApps,
} from '@/app/actions/voice-calendar-actions';
import {
    forgetAllVoiceCallerMemories,
    forgetVoiceCallerMemory,
    type VoiceCallerMemoryList,
} from '@/app/actions/voice-caller-memory-actions';
import type { VoiceAgentPromptTemplate } from '@/helpers/voice-agent-defaults';
import { customVariableNames, VOICE_BUILTIN_VARIABLE_INFO } from '@/helpers/voice-agent-features';
import { defaultBookingTarget, voiceCalendarProviderLabel } from '@/helpers/voice-calendar-providers';
import { VOICE_AGENTS_URL } from '@/helpers/voice-routes';
import {
    bookingFormSchema,
    callSettingsSchema,
    schemaProblem,
    voiceAgentSchema,
    type BookingFormValues,
} from '@/helpers/voice-schemas';
import { browserTimezone } from '@/helpers/voice-time';
import { VOICE_AGENT_TOOLS_ID } from '../_components/tools/VoiceAgentToolsCard';
import { agentFormValues, bookingFormValues, callSettingsFormValues } from '../_utils/editor-form-values';
import { toolsForPrompt, type PromptVariable } from '../_utils/prompt-tools';

/** Default values with something in them, by name. */
function filledValues(values: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()));
}

export type VoiceAgentEditorData = {
    agent: VoiceAgent;
    /** Numbers using the agent, as of the last server render (refreshed after a save). */
    usage: VoiceAgentUsage;
    /** All the owner's numbers, for the numbers dropdown and the test call (refreshed with `usage`). */
    ownedNumbers: VoiceNumberListItem[];
    /** The owner's connected booking apps (shared by all their agents). */
    connectedApps: VoiceConnectedApps;
    /** A connection the owner just came back from (Composio's callback), to say so and offer it. */
    justConnected: string | null;
    /** The callers the agent remembers (caller memory), latest first. */
    memories: VoiceCallerMemoryList;
    /** The Gemini key this agent runs on. */
    geminiKey: VoiceGeminiKeyView;
    /** What its calls have really cost so far (null: none priced yet). */
    costTotals: VoiceAgentCostTotals | null;
    /** The keys, models and voices its stack can use. */
    stackOptions: VoiceAgentStackOptions;
};

/** A calendar (or event type) on a connected app, as the destination picker lists it. */
export type ConnectedAppCalendar = { id: string; name: string; primary: boolean; detail: string | null };

/** What saving one card says. */
type SectionWords = { saved: string; failed: string };

/** The prompt the owner can switch back to after picking a template, and what each one is called. */
type PromptAlternate = { text: string; label: string; currentLabel: string };

/** What happens to the agent's numbers when its call type changes: they follow it, or are let go. */
export type NumbersOnTypeChange = 'switch' | 'unlink';

/** The numbers an agent of this type is linked to: those it answers, or those it calls from. */
export function linkedNumbers(usage: VoiceAgentUsage, callType: VoiceAgentCallType) {
    return callType === VoiceAgentCallType.INBOUND ? usage.inbound : usage.outbound;
}

export function useVoiceAgentEditorPage({
    agent: initialAgent,
    usage,
    ownedNumbers,
    connectedApps,
    justConnected,
    memories: initialMemories,
    geminiKey,
    costTotals,
    stackOptions,
}: VoiceAgentEditorData) {
    const router = useProgressRouter();
    const agentId = initialAgent._id ?? '';
    const [saved, setSaved] = useState<VoiceAgent>(initialAgent);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Three cards, each saved on its own: the agent itself, booking (Tools), call settings.
    const agentForm = useForm({
        resolver: zodResolver(voiceAgentSchema),
        defaultValues: agentFormValues(initialAgent),
    });
    const bookingForm = useForm({
        resolver: zodResolver(bookingFormSchema),
        defaultValues: bookingFormValues(initialAgent.tools.booking),
    });
    const settingsForm = useForm({
        resolver: zodResolver(callSettingsSchema),
        defaultValues: callSettingsFormValues(initialAgent),
    });

    const form = agentForm.watch();
    const booking = bookingForm.watch();
    const settings = settingsForm.watch();
    const agentDirty = agentForm.formState.isDirty;
    const bookingDirty = bookingForm.formState.isDirty;
    const settingsDirty = settingsForm.formState.isDirty;
    const savingAgent = agentForm.formState.isSubmitting;
    const savingBooking = bookingForm.formState.isSubmitting;
    const savingSettings = settingsForm.formState.isSubmitting;

    // What stops each card from saving, in the server's words (the same schemas parse it there).
    const agentError = schemaProblem(voiceAgentSchema, form);
    const bookingError = schemaProblem(bookingFormSchema, booking);
    const settingsError = schemaProblem(callSettingsSchema, settings);
    const canSaveAgent = agentDirty && !agentError && !savingAgent;

    // An agent without booking settings starts from the browser's zone. Known only after hydration.
    useEffect(() => {
        if (!initialAgent.tools.booking) bookingForm.reset(bookingFormValues(null, browserTimezone()));
        // Once, on mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // After a template replaces the owner's own words, both stay one click apart until the page is left.
    const [alternate, setAlternate] = useState<PromptAlternate | null>(null);

    /** Fills the prompt from a template, keeping what was there to switch back to, and its variables' defaults. */
    const applyTemplate = useCallback(
        (template: VoiceAgentPromptTemplate) => {
            const set = { shouldDirty: true, shouldValidate: true };
            const current = agentForm.getValues('prompt');
            if (current.trim() && current !== template.prompt) {
                setAlternate({ text: current, label: 'your prompt', currentLabel: template.title });
            }
            agentForm.setValue('prompt', template.prompt, set);
            const variables = agentForm.getValues('variables');
            for (const [name, value] of Object.entries(template.variables ?? {})) {
                if (!variables[name]?.trim()) agentForm.setValue(`variables.${name}`, value, set);
            }
        },
        [agentForm],
    );

    /** Swaps the prompt with the one it replaced; nothing is lost either way. */
    const switchPrompt = useCallback(() => {
        if (!alternate) return;
        const current = agentForm.getValues('prompt');
        agentForm.setValue('prompt', alternate.text, { shouldDirty: true, shouldValidate: true });
        setAlternate({ text: current, label: alternate.currentLabel, currentLabel: alternate.label });
    }, [agentForm, alternate]);

    /** Custom variables the prompt and the voicemail message (calls it places only) use, in order. */
    const voicemailMessage = form.callType === VoiceAgentCallType.INBOUND ? '' : settings.voicemail.message;
    const usedVariables = useMemo(() => customVariableNames(form.prompt, voicemailMessage), [form.prompt, voicemailMessage]);
    /**
     * What the prompt's "{{" menu offers, and how the prompt marks each name. Not memoised: the form edits
     * `variables` in place, so its identity does not change when a default value does.
     */
    const promptVariables = ((): PromptVariable[] => {
        const custom = [...new Set([...usedVariables, ...Object.keys(filledValues(form.variables))])];
        return [
            ...VOICE_BUILTIN_VARIABLES.map((name) => ({
                name,
                description: VOICE_BUILTIN_VARIABLE_INFO[name],
                builtin: true,
                hasValue: true,
            })),
            ...custom.map((name) => {
                const value = form.variables[name]?.trim() ?? '';
                return {
                    name,
                    description: value ? `Default: ${value}` : 'No default value',
                    builtin: false,
                    hasValue: !!value,
                };
            }),
        ];
    })();

    /** Tools the prompt can name: booking as it is on screen, custom tools as saved. */
    const promptTools = useMemo(
        () =>
            toolsForPrompt(
                {
                    enabled: booking.enabled,
                    bookAppointment: booking.bookAppointment,
                    destination: booking.destination ?? null,
                },
                saved.tools.webhooks,
            ),
        [booking.enabled, booking.bookAppointment, booking.destination, saved.tools.webhooks],
    );

    /**
     * Submits one card: its action saves what the form resolved to, and the saved agent becomes the form's
     * new starting point. Resolves true when the saved version matches the screen.
     */
    const saveSection = useCallback(
        async <V extends FieldValues, O>(
            sectionForm: UseFormReturn<V, unknown, O>,
            problem: string | null,
            action: (values: O) => Promise<ALApiResponse<VoiceAgent>>,
            toValues: (agent: VoiceAgent) => V,
            words: SectionWords,
        ): Promise<boolean> => {
            if (!sectionForm.formState.isDirty) return true;
            let done = false;
            await sectionForm.handleSubmit(
                async (values) => {
                    const response = await action(values);
                    if (!response.success || !response.data) {
                        toast.error(response.error ?? words.failed);
                        return;
                    }
                    setSaved(response.data);
                    sectionForm.reset(toValues(response.data));
                    toast.success(words.saved);
                    done = true;
                },
                () => toast.error(problem ?? words.failed),
            )();
            return done;
        },
        [],
    );

    // Numbers follow the agent's saved type: an inbound agent's answer calls, an outbound one's place them.
    const numbers = linkedNumbers(usage, saved.callType);
    const [linking, setLinking] = useState(false);

    /**
     * Links numbers to this agent (their job follows its saved call type) or unlinks them. One number at
     * a time, as each changes the number's routing in its provider account. Resolves true when all went.
     */
    const linkNumbers = useCallback(
        async (ids: string[], link: boolean): Promise<boolean> => {
            if (ids.length === 0) return true;
            setLinking(true);
            let failed = 0;
            for (const id of ids) {
                const response = await (link ? setNumberAgent(id, agentId) : unlinkAgentNumber(agentId, id)).catch(
                    (e: Error) => ({ success: false as const, error: e.message }),
                );
                // A link the server reports done must show this agent on the number, or the owner hears why not.
                const holds = (n?: VoiceNumberListItem) => !!n && [n.inboundAgentId, n.outboundAgentId].includes(agentId);
                if (!response.success || (link && !holds(response.data))) {
                    failed++;
                    toast.error(
                        (!response.success && response.error) ||
                            (link ? 'The number was not linked. Try again.' : 'Could not change the number'),
                    );
                }
            }
            setLinking(false);
            router.refresh();
            return failed === 0;
        },
        [agentId, router],
    );

    // Saving a new call type while numbers are linked asks first what they should do.
    const [typeChangeOpen, setTypeChangeOpen] = useState(false);

    const saveAgent = useCallback(
        async (onNumbers?: NumbersOnTypeChange): Promise<boolean> => {
            const typeChanged = agentForm.getValues('callType') !== saved.callType;
            if (typeChanged && numbers.length > 0 && !onNumbers) {
                setTypeChangeOpen(true);
                return false;
            }
            setTypeChangeOpen(false);
            const ids = numbers.map((n) => n.id);
            if (typeChanged && onNumbers === 'unlink' && !(await linkNumbers(ids, false))) return false;
            const ok = await saveSection(
                agentForm,
                agentError,
                // Only defaults for variables still in use are kept.
                (values) =>
                    updateVoiceAgent(agentId, {
                        ...values,
                        variables: Object.fromEntries(
                            usedVariables.flatMap((n) => (values.variables[n] ? [[n, values.variables[n]]] : [])),
                        ),
                    }),
                agentFormValues,
                { saved: 'Agent saved', failed: 'Could not save the agent' },
            );
            if (!ok) return false;
            // A number checks the agent's saved type, so it switches once the agent is saved.
            if (typeChanged && onNumbers === 'switch') return linkNumbers(ids, true);
            router.refresh();
            return true;
        },
        [agentError, agentForm, agentId, linkNumbers, numbers, router, saveSection, saved.callType, usedVariables],
    );

    const saveBooking = useCallback(
        () =>
            saveSection(
                bookingForm,
                bookingError,
                (values) => saveVoiceAgentBooking(agentId, values),
                (agent) => bookingFormValues(agent.tools.booking, booking.timezone),
                { saved: 'Booking settings saved', failed: 'Could not save the booking settings' },
            ),
        [agentId, booking.timezone, bookingError, bookingForm, saveSection],
    );

    const saveSettings = useCallback(
        () =>
            saveSection(
                settingsForm,
                settingsError,
                (values) => saveVoiceAgentCallSettings(agentId, values),
                callSettingsFormValues,
                { saved: 'Call settings saved', failed: 'Could not save the call settings' },
            ),
        [agentId, saveSection, settingsError, settingsForm],
    );

    // Connected apps (Composio) and where bookings go.
    const [connections, setConnections] = useState<VoiceCalendarConnection[]>(connectedApps.connections);
    const activeConnections = useMemo(
        () => connections.filter((c) => c.status === VoiceCalendarConnectionStatus.ACTIVE),
        [connections],
    );
    const [calendars, setCalendars] = useState<Record<string, ConnectedAppCalendar[]>>({});
    const [calendarsLoading, setCalendarsLoading] = useState<string | null>(null);
    const [calendarsError, setCalendarsError] = useState<string | null>(null);
    const [connecting, setConnecting] = useState<string | null>(null);
    const [disconnecting, setDisconnecting] = useState<string | null>(null);

    const setBookingDestination = useCallback(
        (destination: VoiceBookingDestination | null) =>
            bookingForm.setValue('destination', destination, { shouldDirty: true, shouldValidate: true }),
        [bookingForm],
    );

    /** The calendars on one connection, fetched once per page. */
    const loadCalendars = useCallback(
        async (connection: VoiceCalendarConnection): Promise<ConnectedAppCalendar[] | null> => {
            const id = connection._id ?? '';
            if (calendars[id]) return calendars[id];
            setCalendarsLoading(id);
            setCalendarsError(null);
            let response: Awaited<ReturnType<typeof listVoiceAppCalendars>>;
            try {
                response = await listVoiceAppCalendars(id);
            } catch {
                response = { success: false, error: 'Could not load the calendars' };
            } finally {
                setCalendarsLoading(null);
            }
            if (!response.success || !response.data) {
                setCalendarsError(response.error ?? 'Could not load the calendars');
                return null;
            }
            const list = response.data;
            setCalendars((c) => ({ ...c, [id]: list }));
            if (list.length === 0)
                setCalendarsError(
                    `No calendars you can book into on this ${voiceCalendarProviderLabel(connection.provider)} account`,
                );
            return list;
        },
        [calendars],
    );

    /**
     * Where bookings go: "builtin" or a connection id. Picks the main calendar of a connection, or its
     * event type when it has just one; with several, the owner chooses (the form names none yet).
     */
    const chooseBookingTarget = useCallback(
        async (target: string) => {
            if (target === 'builtin') {
                setCalendarsError(null);
                setBookingDestination(null);
                return;
            }
            const connection = activeConnections.find((c) => c._id === target);
            if (!connection) return;
            const list = await loadCalendars(connection);
            if (!list?.length) return;
            const pick = defaultBookingTarget(connection.provider, list);
            setBookingDestination({
                provider: connection.provider,
                connectedAccountId: connection.connectedAccountId,
                calendarId: pick?.id ?? '',
                calendarName: pick?.name ?? '',
            });
        },
        [activeConnections, loadCalendars, setBookingDestination],
    );

    // An app picked under "Where bookings go" that is not connected yet (bookings stay where they were until it is).
    const [pickedApp, setPickedApp] = useState<VoiceCalendarProvider | null>(null);
    /** What "Where bookings go" shows: an app just picked, else where bookings go now. */
    const bookingApp: VoiceCalendarProvider | 'builtin' = pickedApp ?? booking.destination?.provider ?? 'builtin';

    /** "builtin" or a provider: its first connected account books (the owner can switch accounts), else it waits to be connected. */
    const chooseBookingApp = useCallback(
        async (app: VoiceCalendarProvider | 'builtin') => {
            setPickedApp(app === 'builtin' ? null : app);
            const connection = activeConnections.find((c) => c.provider === app);
            if (app === 'builtin' || connection) await chooseBookingTarget(connection?._id ?? 'builtin');
        },
        [activeConnections, chooseBookingTarget],
    );

    const discardBooking = useCallback(() => {
        setPickedApp(null);
        setCalendarsError(null);
        bookingForm.reset();
    }, [bookingForm]);

    const chooseBookingCalendar = useCallback(
        (calendarId: string) => {
            const current = booking.destination;
            if (!current) return;
            const connection = activeConnections.find((c) => c.connectedAccountId === current.connectedAccountId);
            const found = connection ? calendars[connection._id ?? '']?.find((c) => c.id === calendarId) : null;
            if (found) setBookingDestination({ ...current, calendarId: found.id, calendarName: found.name });
        },
        [activeConnections, booking.destination, calendars, setBookingDestination],
    );

    /** A tool change saved elsewhere (custom tools): take the server's copy, keep every unsaved edit. */
    const applySavedAgent = useCallback((agent: VoiceAgent) => setSaved(agent), []);

    // Caller memory: who the agent remembers, and forgetting them.
    const [memories, setMemories] = useState<VoiceCallerMemoryList>(initialMemories);
    const [forgetting, setForgetting] = useState<string | null>(null);
    const forgetCaller = useCallback(async (memory: VoiceCallerMemory): Promise<boolean> => {
        const id = memory._id ?? '';
        setForgetting(id);
        const response = await forgetVoiceCallerMemory(id);
        setForgetting(null);
        if (!response.success) {
            toast.error(response.error ?? 'Could not forget the caller');
            return false;
        }
        setMemories((m) => ({ memories: m.memories.filter((x) => x._id !== id), total: Math.max(0, m.total - 1) }));
        toast.success(`Forgot ${memory.phone}`);
        return true;
    }, []);
    const forgetEveryone = useCallback(async (): Promise<boolean> => {
        setForgetting('all');
        const response = await forgetAllVoiceCallerMemories(agentId);
        setForgetting(null);
        if (!response.success || !response.data) {
            toast.error(response.error ?? 'Could not forget the callers');
            return false;
        }
        setMemories({ memories: [], total: 0 });
        toast.success(response.data.deleted === 1 ? 'Forgot 1 caller' : `Forgot ${response.data.deleted} callers`);
        return true;
    }, [agentId]);

    // Everything unsaved on the page, for the playground's "Save and start call".
    const isDirty = agentDirty || bookingDirty || settingsDirty;
    const isValid = !agentError && (!bookingDirty || !bookingError) && (!settingsDirty || !settingsError);

    const save = useCallback(
        async (): Promise<boolean> => (await saveAgent()) && (await saveBooking()) && saveSettings(),
        [saveAgent, saveBooking, saveSettings],
    );

    /**
     * Sends the owner to Composio's Connect Link; they come back to the callback page, which points this agent's
     * booking at the new account. Connecting leaves the page, so check_availability is switched on and everything
     * unsaved is saved first (the callback needs saved booking settings to point at the account).
     */
    const connectApp = useCallback(
        async (provider: string) => {
            if (!bookingForm.getValues('enabled')) {
                bookingForm.setValue('enabled', true, { shouldDirty: true, shouldValidate: true });
            }
            setConnecting(provider);
            if (!(await save())) {
                setConnecting(null);
                return;
            }
            const response = await startVoiceAppConnection(provider, agentId);
            if (!response.success || !response.data) {
                setConnecting(null);
                toast.error(response.error ?? 'Could not start connecting');
                return;
            }
            window.location.assign(response.data.redirectUrl);
        },
        [agentId, bookingForm, save],
    );

    const disconnectApp = useCallback(
        async (connection: VoiceCalendarConnection): Promise<boolean> => {
            const id = connection._id ?? '';
            setDisconnecting(id);
            const response = await disconnectVoiceApp(id);
            setDisconnecting(null);
            if (!response.success || !response.data) {
                toast.error(response.error ?? 'Could not disconnect');
                return false;
            }
            setConnections((list) => list.filter((c) => c._id !== id));
            // The server moved every agent that booked there back to the built-in calendar: so does the form.
            const bookedThere = (d?: VoiceBookingDestination | null) =>
                d?.connectedAccountId === connection.connectedAccountId;
            const { defaultValues } = bookingForm.formState;
            if (defaultValues && bookedThere(defaultValues.destination as VoiceBookingDestination | null)) {
                bookingForm.reset({ ...(defaultValues as BookingFormValues), destination: null }, { keepDirtyValues: true });
            }
            if (bookedThere(bookingForm.getValues('destination'))) {
                setPickedApp(null);
                setBookingDestination(null);
            }
            toast.success(
                `${voiceCalendarProviderLabel(connection.provider)} disconnected` +
                    (response.data.agentsReset
                        ? `; ${response.data.agentsReset === 1 ? 'one agent books' : `${response.data.agentsReset} agents book`} into the built-in calendar again`
                        : ''),
            );
            router.refresh();
            return true;
        },
        [bookingForm, router, setBookingDestination],
    );

    // Back from Composio: say so and show the Tools card. The server already pointed this agent at the
    // new connection when it could; else (several event types) it is offered for the owner to finish.
    const welcomed = useRef(false);
    useEffect(() => {
        if (!justConnected || welcomed.current) return;
        welcomed.current = true;
        const connection = connections.find((c) => c._id === justConnected);
        if (!connection) return;
        const { enabled, destination } = bookingForm.getValues();
        const into = destination?.connectedAccountId === connection.connectedAccountId;
        toast.success(
            `${voiceCalendarProviderLabel(connection.provider)} connected${connection.label ? ` as ${connection.label}` : ''}`,
            into ? { description: `Bookings now go to ${destination?.calendarName}.` } : undefined,
        );
        document.getElementById(VOICE_AGENT_TOOLS_ID)?.scrollIntoView({ block: 'start' });
        const forget = () => window.history.replaceState(window.history.state, '', window.location.pathname);
        if (enabled && !destination) void chooseBookingTarget(justConnected).finally(forget);
        else forget();
        // Once, on mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onDeleteOpenChange = useCallback(
        (open: boolean) => {
            if (!open && deleting) return;
            setDeleteOpen(open);
        },
        [deleting],
    );

    const confirmDelete = useCallback(async () => {
        setDeleting(true);
        // The server keeps an agent that still answers a number (its callers would ring into nothing): let those go first.
        const answering = usage.inbound.map((n) => n.id);
        if (!(await linkNumbers(answering, false))) {
            setDeleting(false);
            return;
        }
        const response = await deleteVoiceAgent(agentId);
        if (!response.success) {
            setDeleting(false);
            toast.error(response.error ?? 'Could not delete the agent');
            return;
        }
        toast.success('Agent deleted');
        router.replace(VOICE_AGENTS_URL);
        router.refresh();
    }, [agentId, linkNumbers, router, usage.inbound]);

    // What a minute should cost, as the stack, prompt and booking on screen stand, on the numbers it is on.
    const stack = (form.stack ?? VOICE_DEFAULT_STACK) as VoiceStack<string>;
    // What stops its calls, as the form stands (the playground saves it first; the actions check the saved agent).
    // The playground goes straight to the model; test calls and the browser / softphone tests need a number.
    const callBlockers = voiceCallBlockers({ prompt: form.prompt, stack, keys: stackOptions.keys });
    const phoneBlockers = voiceCallBlockers({
        prompt: form.prompt,
        stack,
        keys: stackOptions.keys,
        onNumber: usage.inbound.length + usage.outbound.length > 0,
        channel: channelOf(saved),
    });
    const thinker = stack.kind === VoiceStackKind.REALTIME ? stack : stack.llm;
    const costEstimate = estimateAgentCost({
        promptChars: form.prompt.length,
        freeTier: thinker.provider === VoiceKeyProvider.GEMINI && voiceKeyFor(stackOptions.keys, thinker)?.tier === 'free',
        callType: form.callType,
        providers: numbers.map((n) => n.provider),
        stack,
        catalogue: stackOptions.catalogue,
        tools: [
            ...(booking.enabled ? [{ kind: 'booking' as const }] : []),
            ...saved.tools.webhooks
                .filter((tool) => tool.enabled)
                .map((tool) => ({
                    kind: 'custom' as const,
                    name: tool.name,
                    chars: 2 * tool.description.length + tool.parameters.reduce((n, p) => n + p.description.length, 0),
                })),
        ],
    });

    return {
        agentId,
        geminiKey,
        stackOptions,
        stack,
        callBlockers,
        phoneBlockers,
        costEstimate,
        costTotals,
        saved,
        usage,
        ownedNumbers,
        agentForm,
        form,
        applyTemplate,
        alternate,
        switchPrompt,
        numbers,
        linking,
        linkNumbers,
        typeChangeOpen,
        setTypeChangeOpen,
        usedVariables,
        promptVariables,
        promptTools,
        agentDirty,
        canSaveAgent,
        saveAgent,
        settingsForm,
        settings,
        settingsDirty,
        settingsError,
        savingSettings,
        saveSettings,
        memories,
        forgetting,
        forgetCaller,
        forgetEveryone,
        bookingForm,
        booking,
        bookingApp,
        chooseBookingApp,
        discardBooking,
        bookingDirty,
        bookingError,
        savingBooking,
        saveBooking,
        justConnected,
        connectedAppsConfigured: connectedApps.configured,
        connections,
        activeConnections,
        calendars,
        calendarsLoading,
        calendarsError,
        loadCalendars,
        chooseBookingTarget,
        chooseBookingCalendar,
        connecting,
        connectApp,
        disconnecting,
        disconnectApp,
        applySavedAgent,
        isDirty,
        isValid,
        saving: savingAgent || savingBooking || savingSettings,
        save,
        deleteOpen,
        setDeleteOpen: onDeleteOpenChange,
        deleting,
        confirmDelete,
    };
}

export type UseVoiceAgentEditorPageReturn = ReturnType<typeof useVoiceAgentEditorPage>;
