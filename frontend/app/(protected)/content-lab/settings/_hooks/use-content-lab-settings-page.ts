'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    CONTENT_LAB_SUB_MODULES,
    ContentLabConnectionStatus,
    type ContentLabAiKeyView,
    type ContentLabConnection,
    type ContentLabConnectPlatform,
    type ContentLabProfile,
} from '@aixellabs/backend/db/types';
import { saveContentLabProfile, type ContentLabProfileInput } from '@/app/actions/content-lab-actions';
import {
    confirmContentLabConnection,
    disconnectContentLabConnection,
    listContentLabConnections,
    recheckContentLabAiKey,
    removeContentLabAiKey,
    saveContentLabAiKey,
    startContentLabConnection,
    type ContentLabConnections,
} from '@/app/actions/content-lab-settings-actions';
import { SubModuleUrls } from '@/config/app-config';
import { useProgressRouter } from '@/hooks/use-progress-router';
import { CONTENT_LAB_PLATFORM_LABELS } from '../../_constants';

export type ContentLabSettingsPageData = {
    profile: ContentLabProfile;
    /** Null when it could not be read. */
    aiKey: ContentLabAiKeyView | null;
    connections: ContentLabConnections;
    /** Back from Composio's Connect Link (`?connect=…`). */
    returning: { platform: ContentLabConnectPlatform | null; connectedAccountId: string | null; composioStatus: string | null } | null;
};

const SETTINGS_URL = SubModuleUrls[CONTENT_LAB_SUB_MODULES.SETTINGS];

const NO_KEY: ContentLabAiKeyView = { provider: 'gemini', set: false, last4: null, status: null, statusMessage: null, checkedAt: null };

const toForm = (profile: ContentLabProfile): ContentLabProfileInput => ({
    handles: { youtube: profile.handles.youtube ?? '', instagram: profile.handles.instagram ?? '' },
    betaHandles: { x: profile.betaHandles?.x ?? '', linkedin: profile.betaHandles?.linkedin ?? '' },
    country: profile.country,
    language: profile.language,
});

type KeyAction = 'save' | 'check' | 'remove';

/**
 * Content Lab settings: own accounts (connect through Composio, reconnect, disconnect, or a public
 * handle), Content Lab's own Gemini key (checked with Google before it is saved), default country and language.
 */
export function useContentLabSettingsPage({ profile, aiKey: initialKey, connections: initialConnections, returning }: ContentLabSettingsPageData) {
    const router = useProgressRouter();
    const [form, setForm] = useState(() => toForm(profile));
    const [saving, setSaving] = useState(false);

    const [aiKey, setAiKey] = useState(initialKey ?? NO_KEY);
    const [keyInput, setKeyInput] = useState('');
    const [keyBusy, setKeyBusy] = useState<KeyAction | null>(null);

    const [connections, setConnections] = useState(initialConnections.connections);
    /** The platform whose Connect Link is being made, or which is being confirmed after coming back. */
    const [connecting, setConnecting] = useState<ContentLabConnectPlatform | null>(
        returning?.connectedAccountId && returning.platform ? returning.platform : null,
    );
    const [disconnecting, setDisconnecting] = useState<string | null>(null);
    const confirmed = useRef(false);

    const setHandle = (group: 'handles' | 'betaHandles', platform: string, value: string) =>
        setForm((current) => ({ ...current, [group]: { ...current[group], [platform]: value } }));

    const upsertConnection = (connection: ContentLabConnection) =>
        setConnections((list) => [connection, ...list.filter((item) => item.platform !== connection.platform)]);

    // Back from Composio: confirm the account once, then drop the query so a reload does not repeat it.
    useEffect(() => {
        if (!returning || confirmed.current) return;
        confirmed.current = true;
        const label = returning.platform ? CONTENT_LAB_PLATFORM_LABELS[returning.platform] : 'Your account';
        void (async () => {
            if (!returning.connectedAccountId) {
                toast.error(`The sign-in did not finish, so ${label} is not connected. Try again.`);
            } else {
                const response = await confirmContentLabConnection(returning.connectedAccountId, returning.composioStatus).catch(() => null);
                const connection = response?.success ? response.data : undefined;
                if (connection) {
                    upsertConnection(connection);
                    if (connection.account?.handle) setHandle('handles', connection.platform, connection.account.handle);
                    toast.success(`${label} connected${connection.account?.handle ? ` as @${connection.account.handle}` : ''}`);
                } else {
                    toast.error(response?.error ?? `${label} was not connected. Try again.`);
                }
                // A sign-in that failed is kept as one to connect again.
                const latest = await listContentLabConnections().catch(() => null);
                if (latest?.success && latest.data) setConnections(latest.data.connections);
            }
            setConnecting(null);
            router.replace(SETTINGS_URL);
        })();
        // Once: the confirmation is not repeatable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const save = async () => {
        setSaving(true);
        const response = await saveContentLabProfile(form);
        setSaving(false);
        if (!response.success || !response.data) {
            toast.error(response.error ?? 'Could not save your settings');
            return;
        }
        setForm(toForm(response.data));
        toast.success('Settings saved');
    };

    /** Off to Composio's Connect Link; it sends the browser back here. */
    const connect = async (platform: ContentLabConnectPlatform) => {
        setConnecting(platform);
        const response = await startContentLabConnection(platform).catch(() => null);
        if (!response?.success || !response.data) {
            setConnecting(null);
            toast.error(response?.error ?? 'Could not start connecting');
            return;
        }
        window.location.assign(response.data.redirectUrl);
    };

    const disconnect = async (connection: ContentLabConnection) => {
        setDisconnecting(connection._id);
        const response = await disconnectContentLabConnection(connection._id);
        setDisconnecting(null);
        if (!response.success) {
            toast.error(response.error ?? 'Could not disconnect');
            return;
        }
        setConnections((list) => list.filter((item) => item._id !== connection._id));
        if (connection.account?.handle && form.handles[connection.platform] === connection.account.handle) {
            setHandle('handles', connection.platform, '');
        }
        toast.success(`${CONTENT_LAB_PLATFORM_LABELS[connection.platform]} disconnected`);
    };

    const runKey = async (action: KeyAction, call: () => ReturnType<typeof recheckContentLabAiKey>, done: string) => {
        setKeyBusy(action);
        const response = await call().catch(() => null);
        setKeyBusy(null);
        if (!response?.success || !response.data) {
            toast.error(response?.error ?? 'Could not reach the server. Try again.');
            return false;
        }
        setAiKey(response.data);
        toast.success(done);
        return true;
    };

    const saveKey = async () => {
        const key = keyInput.trim();
        if (!key) return;
        if (await runKey('save', () => saveContentLabAiKey(key), 'Key saved. Google accepted it.')) setKeyInput('');
    };

    return {
        form,
        setHandle,
        setCountry: (country: string) => setForm((current) => ({ ...current, country })),
        setLanguage: (language: string) => setForm((current) => ({ ...current, language })),
        saving,
        save,
        aiKey,
        keyInput,
        setKeyInput,
        keyBusy,
        saveKey,
        recheckKey: () => runKey('check', recheckContentLabAiKey, 'Checked with Google'),
        removeKey: () => runKey('remove', removeContentLabAiKey, 'Key removed'),
        composioReady: initialConnections.configured,
        /** The platform's connection: the active one, else one that needs connecting again. */
        connectionFor: (platform: ContentLabConnectPlatform) =>
            connections.find((item) => item.platform === platform && item.status === ContentLabConnectionStatus.ACTIVE) ??
            connections.find((item) => item.platform === platform && item.status === ContentLabConnectionStatus.FAILED) ??
            null,
        connecting,
        connect,
        disconnecting,
        disconnect,
    };
}

export type UseContentLabSettingsPageReturn = ReturnType<typeof useContentLabSettingsPage>;
