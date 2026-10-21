'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { type FieldValues, useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
    VOICE_BUILTIN_VARIABLES,
    type VoiceAgent,
    type VoiceBookingDestination,
    type VoiceCalendarConnection,
    VoiceCalendarConnectionStatus,
    type VoiceCallerMemory,
    type VoiceGeminiKeyView,
} from '@aixellabs/backend/db/types';
import type { ALApiResponse } from '@aixellabs/backend/api/types';
import {
    deleteVoiceAgent,
    saveVoiceAgentBooking,
    saveVoiceAgentCallSettings,
    updateVoiceAgent,
    type VoiceAgentUsage,
} from '@/app/actions/voice-agent-actions';
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
import { VOICE_AGENT_PROMPT_TEMPLATES, type VoiceAgentPromptTemplate } from '@/helpers/voice-agent-defaults';
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
    /** The owner's connected booking apps (shared by all their agents). */
    connectedApps: VoiceConnectedApps;
    /** A connection the owner just came back from (Composio's callback), to say so and offer it. */
    justConnected: string | null;
    /** The callers the agent remembers (caller memory), latest first. */
    memories: VoiceCallerMemoryList;
    /** The owner's Gemini key, which this agent (like all of theirs) runs on. */
    geminiKey: VoiceGeminiKeyView;
};

/** A calendar (or event type) on a connected app, as the destination picker lists it. */
export type ConnectedAppCalendar = { id: string; name: string; primary: boolean; detail: string | null };

/** What saving one card says. */
type SectionWords = { saved: string; failed: string };

export function useVoiceAgentEditorPage({
    agent: initialAgent,
    usage,
    connectedApps,
    justConnected,
    memories: initialMemories,
    geminiKey,
}: VoiceAgentEditorData) {
    const router = useRouter();
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

    /** Fills the prompt from a template, and the call notes too unless the owner wrote their own. */
    const applyTemplate = useCallback(
        (template: VoiceAgentPromptTemplate) => {
            const set = { shouldDirty: true, shouldValidate: true };
            agentForm.setValue('prompt', template.prompt, set);
            const notes = agentForm.getValues('callNotes').trim();
            if (!notes || VOICE_AGENT_PROMPT_TEMPLATES.some((t) => t.callNotes.trim() === notes)) {
                agentForm.setValue('callNotes', template.callNotes, set);
            }
        },
        [agentForm],
    );

    /** Custom variables the prompt, the call notes and the voicemail message use, in order. */
    const usedVariables = useMemo(
        () => customVariableNames(form.prompt, form.callNotes, settings.voicemail.message),
        [form.prompt, form.callNotes, settings.voicemail.message],
    );
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
        () => toolsForPrompt({ enabled: booking.enabled, destination: booking.destination ?? null }, saved.tools.webhooks),
        [booking.enabled, booking.destination, saved.tools.webhooks],
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

    const saveAgent = useCallback(async (): Promise<boolean> => {
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
        if (ok) router.refresh();
        return ok;
    }, [agentError, agentForm, agentId, router, saveSection, usedVariables]);

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

    /** Sends the owner to Composio's Connect Link; they come back to the callback page. */
    const connectApp = useCallback(
        async (provider: string) => {
            if (isDirty) {
                toast.error('Save or discard your changes first: connecting an app leaves this page');
                return;
            }
            setConnecting(provider);
            const response = await startVoiceAppConnection(provider, agentId);
            if (!response.success || !response.data) {
                setConnecting(null);
                toast.error(response.error ?? 'Could not start connecting');
                return;
            }
            window.location.assign(response.data.redirectUrl);
        },
        [agentId, isDirty],
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
            if (bookedThere(bookingForm.getValues('destination'))) setBookingDestination(null);
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

    const save = useCallback(
        async (): Promise<boolean> => (await saveAgent()) && (await saveBooking()) && saveSettings(),
        [saveAgent, saveBooking, saveSettings],
    );

    const onDeleteOpenChange = useCallback(
        (open: boolean) => {
            if (!open && deleting) return;
            setDeleteOpen(open);
        },
        [deleting],
    );

    const confirmDelete = useCallback(async () => {
        setDeleting(true);
        const response = await deleteVoiceAgent(agentId);
        if (!response.success) {
            setDeleting(false);
            toast.error(response.error ?? 'Could not delete the agent');
            return;
        }
        toast.success('Agent deleted');
        router.replace(VOICE_AGENTS_URL);
        router.refresh();
    }, [agentId, router]);

    return {
        agentId,
        geminiKey,
        saved,
        usage,
        agentForm,
        form,
        applyTemplate,
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
        bookingDirty,
        bookingError,
        savingBooking,
        saveBooking,
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
