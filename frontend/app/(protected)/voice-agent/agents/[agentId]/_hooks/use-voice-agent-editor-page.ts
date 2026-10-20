'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    VOICE_BUILTIN_VARIABLES,
    type VoiceAgent,
    type VoiceAgentCallType,
    type VoiceAgentVoice,
    type VoiceBookingDestination,
    type VoiceCalendarConnection,
    VoiceCalendarConnectionStatus,
    type VoiceCallerMemory,
    type VoiceWeekday,
} from '@aixellabs/backend/db/types';
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
import { customVariableNames, VOICE_BUILTIN_VARIABLE_INFO } from '@/helpers/voice-agent-features';
import { defaultBookingTarget, voiceCalendarProviderLabel } from '@/helpers/voice-calendar-providers';
import { voiceAgentDefaults } from '@/helpers/voice-agent-defaults';
import type { VoiceAgentInput } from '@/helpers/voice-schemas';
import { browserTimezone } from '@/helpers/voice-time';
import { VOICE_AGENTS_URL } from '@/helpers/voice-routes';
import {
    type BookingDayDraft,
    type BookingDraft,
    bookingDraftError,
    bookingToDraft,
    draftToBooking,
    sameBooking,
} from '../_utils/booking-draft';
import {
    draftToSettings,
    newFieldKey,
    sameSettings,
    settingsDraftError,
    settingsToDraft,
    type AnalysisFieldDraft,
    type CallSettingsDraft,
} from '../_utils/call-settings-draft';
import { toolsForPrompt, type PromptVariable } from '../_utils/prompt-tools';

function toInput(agent: VoiceAgent): VoiceAgentInput {
    return {
        name: agent.name,
        callType: agent.callType,
        voice: agent.voice,
        prompt: agent.prompt,
        callNotes: agent.callNotes,
        variables: { ...(agent.variables ?? {}) },
    };
}

/** Default values with something in them, by name. */
function filledValues(values: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()));
}

function sameValues(a: Record<string, string>, b: Record<string, string>): boolean {
    const x = filledValues(a);
    const y = filledValues(b);
    return Object.keys(x).length === Object.keys(y).length && Object.entries(x).every(([k, v]) => y[k]?.trim() === v.trim());
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
};

/** A calendar (or event type) on a connected app, as the destination picker lists it. */
export type ConnectedAppCalendar = { id: string; name: string; primary: boolean; detail: string | null };

export function useVoiceAgentEditorPage({
    agent: initialAgent,
    usage,
    connectedApps,
    justConnected,
    memories: initialMemories,
}: VoiceAgentEditorData) {
    const router = useRouter();
    const agentId = initialAgent._id ?? '';
    const [saved, setSaved] = useState<VoiceAgent>(initialAgent);
    const [form, setForm] = useState<VoiceAgentInput>(() => toInput(initialAgent));
    const [saving, setSaving] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Booking settings: a draft against the last saved version, saved on their own (Tools card).
    const [bookingBase, setBookingBase] = useState<BookingDraft>(() => bookingToDraft(initialAgent.tools.booking));
    const [bookingDraft, setBookingDraft] = useState<BookingDraft>(bookingBase);
    const [savingBooking, setSavingBooking] = useState(false);

    // An agent without booking settings starts from the browser's zone. Known only after hydration.
    useEffect(() => {
        if (initialAgent.tools.booking) return;
        const timezone = browserTimezone();
        setBookingBase((b) => ({ ...b, timezone }));
        setBookingDraft((d) => ({ ...d, timezone }));
        // Once, on mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const agentDirty = useMemo(() => {
        const base = toInput(saved);
        return (
            form.name !== base.name ||
            form.callType !== base.callType ||
            form.voice !== base.voice ||
            form.prompt !== base.prompt ||
            form.callNotes !== base.callNotes ||
            !sameValues(form.variables, base.variables)
        );
    }, [form, saved]);

    const agentValid = form.name.trim().length > 0 && form.prompt.trim().length > 0;
    const canSaveAgent = agentDirty && agentValid && !saving;

    const bookingDirty = useMemo(() => !sameBooking(bookingDraft, bookingBase), [bookingDraft, bookingBase]);
    const bookingError = useMemo(() => bookingDraftError(bookingDraft), [bookingDraft]);
    const canSaveBooking = bookingDirty && !bookingError && !savingBooking;

    const setName = useCallback((name: string) => setForm((f) => ({ ...f, name })), []);
    /** Only the type: the prompt and call notes stay as they are. */
    const setCallType = useCallback((callType: VoiceAgentCallType) => setForm((f) => ({ ...f, callType })), []);
    const setVoice = useCallback((voice: VoiceAgentVoice) => setForm((f) => ({ ...f, voice })), []);
    const setPrompt = useCallback((prompt: string) => setForm((f) => ({ ...f, prompt })), []);
    const setCallNotes = useCallback((callNotes: string) => setForm((f) => ({ ...f, callNotes })), []);
    /** The defaults for the type picked on screen (which may not be saved yet). */
    const defaults = useMemo(() => voiceAgentDefaults(form.callType), [form.callType]);
    const resetPrompt = useCallback(() => setForm((f) => ({ ...f, prompt: defaults.prompt })), [defaults]);
    const resetCallNotes = useCallback(() => setForm((f) => ({ ...f, callNotes: defaults.callNotes })), [defaults]);
    const discardAgentChanges = useCallback(() => setForm(toInput(saved)), [saved]);
    const setVariable = useCallback(
        (name: string, value: string) => setForm((f) => ({ ...f, variables: { ...f.variables, [name]: value } })),
        [],
    );

    // Call settings (voicemail, analysis, memory): a draft against the saved version, saved on their own.
    const [settingsBase, setSettingsBase] = useState<CallSettingsDraft>(() => settingsToDraft(initialAgent));
    const [settingsDraft, setSettingsDraft] = useState<CallSettingsDraft>(settingsBase);
    const [savingSettings, setSavingSettings] = useState(false);
    const settingsDirty = useMemo(() => !sameSettings(settingsDraft, settingsBase), [settingsDraft, settingsBase]);
    const settingsError = useMemo(() => settingsDraftError(settingsDraft), [settingsDraft]);
    const canSaveSettings = settingsDirty && !settingsError && !savingSettings;
    const setSettings = useCallback(
        (patch: Partial<CallSettingsDraft>) => setSettingsDraft((d) => ({ ...d, ...patch })),
        [],
    );
    const setAnalysisField = useCallback(
        (key: string, patch: Partial<AnalysisFieldDraft>) =>
            setSettingsDraft((d) => ({ ...d, fields: d.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)) })),
        [],
    );
    const addAnalysisField = useCallback(
        () =>
            setSettingsDraft((d) => ({
                ...d,
                fields: [...d.fields, { key: newFieldKey(), name: '', type: 'text', description: '', options: '' }],
            })),
        [],
    );
    const removeAnalysisField = useCallback(
        (key: string) => setSettingsDraft((d) => ({ ...d, fields: d.fields.filter((f) => f.key !== key) })),
        [],
    );
    const discardSettingsChanges = useCallback(() => setSettingsDraft(settingsBase), [settingsBase]);

    /** Custom variables the prompt, the call notes and the voicemail message use, in order. */
    const usedVariables = useMemo(
        () => customVariableNames(form.prompt, form.callNotes, settingsDraft.voicemailMessage),
        [form.prompt, form.callNotes, settingsDraft.voicemailMessage],
    );
    /** What the prompt's "{{" menu offers, and how the prompt marks each name. */
    const promptVariables = useMemo((): PromptVariable[] => {
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
    }, [usedVariables, form.variables]);

    const setBookingEnabled = useCallback((enabled: boolean) => setBookingDraft((d) => ({ ...d, enabled })), []);
    const setBookingTimezone = useCallback((timezone: string) => setBookingDraft((d) => ({ ...d, timezone })), []);
    const setBookingSlotMinutes = useCallback((slotMinutes: number) => setBookingDraft((d) => ({ ...d, slotMinutes })), []);
    const setBookingMaxDaysAhead = useCallback(
        (maxDaysAhead: string) => setBookingDraft((d) => ({ ...d, maxDaysAhead })),
        [],
    );
    const setBookingDay = useCallback(
        (day: VoiceWeekday, patch: Partial<BookingDayDraft>) =>
            setBookingDraft((d) => ({ ...d, days: { ...d.days, [day]: { ...d.days[day], ...patch } } })),
        [],
    );
    const discardBookingChanges = useCallback(() => setBookingDraft(bookingBase), [bookingBase]);

    /** Tools the prompt can name: booking as it is on screen, custom tools as saved. */
    const promptTools = useMemo(
        () => toolsForPrompt(bookingDraft, saved.tools.webhooks),
        [bookingDraft, saved.tools.webhooks],
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
        (destination: VoiceBookingDestination | null) => setBookingDraft((d) => ({ ...d, destination })),
        [],
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
     * event type when it has just one; with several, the owner chooses (the draft names none yet).
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
            const current = bookingDraft.destination;
            if (!current) return;
            const connection = activeConnections.find((c) => c.connectedAccountId === current.connectedAccountId);
            const found = connection ? calendars[connection._id ?? '']?.find((c) => c.id === calendarId) : null;
            if (found) setBookingDestination({ ...current, calendarId: found.id, calendarName: found.name });
        },
        [activeConnections, bookingDraft.destination, calendars, setBookingDestination],
    );

    /** A tool change saved elsewhere (custom tools): take the server's copy, keep every unsaved edit. */
    const applySavedAgent = useCallback((agent: VoiceAgent) => setSaved(agent), []);

    /** Saves the booking settings. Resolves true when the saved version matches the screen. */
    const saveBooking = useCallback(async (): Promise<boolean> => {
        if (!bookingDirty) return true;
        if (bookingError) {
            toast.error(bookingError);
            return false;
        }
        setSavingBooking(true);
        const response = await saveVoiceAgentBooking(agentId, draftToBooking(bookingDraft));
        setSavingBooking(false);
        if (!response.success || !response.data) {
            toast.error(response.error ?? 'Could not save the booking settings');
            return false;
        }
        const next = bookingToDraft(response.data.tools.booking, bookingDraft.timezone);
        setSaved(response.data);
        setBookingBase(next);
        setBookingDraft(next);
        toast.success('Booking settings saved');
        return true;
    }, [agentId, bookingDirty, bookingDraft, bookingError]);

    /** Saves the agent's fields. Resolves true when the saved version now matches what is on screen. */
    const saveAgent = useCallback(async (): Promise<boolean> => {
        if (!agentDirty) return true;
        if (!agentValid) {
            toast.error('Name and prompt are required');
            return false;
        }
        setSaving(true);
        // Only defaults for variables still in use are kept.
        const variables = Object.fromEntries(
            usedVariables.flatMap((name) => (form.variables[name]?.trim() ? [[name, form.variables[name].trim()]] : [])),
        );
        const response = await updateVoiceAgent(agentId, { ...form, variables });
        setSaving(false);
        if (!response.success || !response.data) {
            toast.error(response.error ?? 'Could not save the agent');
            return false;
        }
        setSaved(response.data);
        setForm(toInput(response.data));
        toast.success('Agent saved');
        router.refresh();
        return true;
    }, [agentId, form, agentDirty, agentValid, router, usedVariables]);

    /** Saves the call settings. Resolves true when the saved version matches the screen. */
    const saveSettings = useCallback(async (): Promise<boolean> => {
        if (!settingsDirty) return true;
        if (settingsError) {
            toast.error(settingsError);
            return false;
        }
        setSavingSettings(true);
        const response = await saveVoiceAgentCallSettings(agentId, draftToSettings(settingsDraft));
        setSavingSettings(false);
        if (!response.success || !response.data) {
            toast.error(response.error ?? 'Could not save the call settings');
            return false;
        }
        const next = settingsToDraft(response.data);
        setSaved(response.data);
        setSettingsBase(next);
        setSettingsDraft(next);
        toast.success('Call settings saved');
        return true;
    }, [agentId, settingsDirty, settingsDraft, settingsError]);

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
            // The server moved every agent that booked there back to the built-in calendar.
            const off = (b: BookingDraft) =>
                b.destination?.connectedAccountId === connection.connectedAccountId ? { ...b, destination: null } : b;
            setBookingBase(off);
            setBookingDraft(off);
            toast.success(
                `${voiceCalendarProviderLabel(connection.provider)} disconnected` +
                    (response.data.agentsReset
                        ? `; ${response.data.agentsReset === 1 ? 'one agent books' : `${response.data.agentsReset} agents book`} into the built-in calendar again`
                        : ''),
            );
            router.refresh();
            return true;
        },
        [router],
    );

    // Back from Composio: say so and show the Tools card. The server already pointed this agent at the
    // new connection when it could; else (several event types) it is offered for the owner to finish.
    const welcomed = useRef(false);
    useEffect(() => {
        if (!justConnected || welcomed.current) return;
        welcomed.current = true;
        const connection = connections.find((c) => c._id === justConnected);
        if (!connection) return;
        const into = bookingDraft.destination?.connectedAccountId === connection.connectedAccountId;
        toast.success(
            `${voiceCalendarProviderLabel(connection.provider)} connected${connection.label ? ` as ${connection.label}` : ''}`,
            into ? { description: `Bookings now go to ${bookingDraft.destination?.calendarName}.` } : undefined,
        );
        document.getElementById('voice-agent-tools')?.scrollIntoView({ block: 'start' });
        const forget = () => window.history.replaceState(window.history.state, '', window.location.pathname);
        if (bookingDraft.enabled && !bookingDraft.destination) void chooseBookingTarget(justConnected).finally(forget);
        else forget();
        // Once, on mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const isValid = agentValid && (!bookingDirty || !bookingError) && (!settingsDirty || !settingsError);
    const save = useCallback(async (): Promise<boolean> => {
        const agentSaved = await saveAgent();
        if (!agentSaved) return false;
        if (!(await saveBooking())) return false;
        return saveSettings();
    }, [saveAgent, saveBooking, saveSettings]);

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
        saved,
        usage,
        form,
        defaults,
        setName,
        setCallType,
        setVoice,
        setPrompt,
        setCallNotes,
        resetPrompt,
        resetCallNotes,
        discardAgentChanges,
        setVariable,
        usedVariables,
        promptVariables,
        settingsDraft,
        settingsDirty,
        settingsError,
        canSaveSettings,
        savingSettings,
        setSettings,
        setAnalysisField,
        addAnalysisField,
        removeAnalysisField,
        discardSettingsChanges,
        saveSettings,
        memories,
        forgetting,
        forgetCaller,
        forgetEveryone,
        promptTools,
        agentDirty,
        canSaveAgent,
        saveAgent,
        bookingDraft,
        bookingDirty,
        bookingError,
        canSaveBooking,
        savingBooking,
        setBookingEnabled,
        setBookingTimezone,
        setBookingSlotMinutes,
        setBookingMaxDaysAhead,
        setBookingDay,
        discardBookingChanges,
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
        saving: saving || savingBooking || savingSettings,
        save,
        deleteOpen,
        setDeleteOpen: onDeleteOpenChange,
        deleting,
        confirmDelete,
    };
}

export type UseVoiceAgentEditorPageReturn = ReturnType<typeof useVoiceAgentEditorPage>;
