'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    VOICE_CAMPAIGN_LIMITS,
    VOICE_WEEKDAYS,
    VoiceCampaignRetryOutcome,
    type VoiceCampaignDay,
    type VoiceCampaignRetry,
    type VoiceCampaignWindow,
} from '@aixellabs/backend/db/types';
import {
    addVoiceCampaignContacts,
    createVoiceCampaign,
    deleteVoiceCampaign,
    setVoiceCampaignStatus,
    type VoiceCampaignSetup,
} from '@/app/actions/voice-campaign-actions';
import {
    CAMPAIGN_COUNTRIES,
    campaignCountry,
    checkContacts,
    guessColumns,
    parseCsv,
    rowsToContactInputs,
    variableKeys,
} from '@/helpers/voice-campaign-contacts';
import { browserTimezone } from '@/helpers/voice-time';
import { campaignUrl } from '@/helpers/voice-routes';

export type NewCampaignPageData = {
    setup: VoiceCampaignSetup;
    loadError: string | null;
};

export const WIZARD_STEPS = ['Details', 'Contacts', 'Schedule', 'Review'] as const;

/** Biggest CSV the browser reads (10,000 contacts with a few columns is well under). */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const CONTACTS_PER_REQUEST = 500;

export type CsvFile = { fileName: string; headers: string[]; rows: string[][] };

/** The country of the number calls go out from: numbers without a "+" are most likely local to it. */
function countryForNumber(phoneNumber: string | undefined): string {
    if (!phoneNumber) return 'IN';
    const match = [...CAMPAIGN_COUNTRIES]
        .sort((a, b) => b.dial.length - a.dial.length)
        .find((c) => phoneNumber.startsWith(`+${c.dial}`));
    return match?.code ?? 'IN';
}

export function useNewCampaignPage(data: NewCampaignPageData) {
    const router = useRouter();
    const { agents, numbers } = data.setup;
    const [step, setStep] = useState(0);

    const [name, setName] = useState('');
    const [agentId, setAgentId] = useState(agents.length === 1 ? agents[0].id : '');
    const [numberId, setNumberIdState] = useState(numbers.length === 1 ? numbers[0].id : '');
    const [country, setCountry] = useState(countryForNumber(numbers.length === 1 ? numbers[0].phoneNumber : undefined));
    const setNumberId = (id: string) => {
        setNumberIdState(id);
        if (!csv) setCountry(countryForNumber(numbers.find((n) => n.id === id)?.phoneNumber));
    };

    const [csv, setCsv] = useState<CsvFile | null>(null);
    const [csvError, setCsvError] = useState<string | null>(null);
    const [mapping, setMapping] = useState<{ phone: number | null; name: number | null }>({ phone: null, name: null });

    const [callWindow, setCallWindow] = useState<VoiceCampaignWindow>({
        days: VOICE_WEEKDAYS.slice(0, 5),
        start: '09:00',
        end: '18:00',
        timezone: browserTimezone(),
    });
    const [maxConcurrent, setMaxConcurrent] = useState(2);
    const [retry, setRetry] = useState<VoiceCampaignRetry>({
        maxRetries: 1,
        delayMinutes: 60,
        on: [VoiceCampaignRetryOutcome.NO_ANSWER, VoiceCampaignRetryOutcome.BUSY],
    });

    const [submitting, setSubmitting] = useState<null | 'draft' | 'start'>(null);
    const [uploaded, setUploaded] = useState<{ sent: number; total: number } | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const readFile = async (file: File | null | undefined) => {
        setCsvError(null);
        if (!file) return;
        if (file.size > MAX_FILE_BYTES) {
            setCsvError('That file is over 5 MB. Split it into smaller campaigns.');
            return;
        }
        const rows = parseCsv(await file.text());
        if (rows.length < 2) {
            setCsvError('The file needs a header row and at least one contact.');
            return;
        }
        const headers = rows[0].map((h, i) => h.trim() || `Column ${i + 1}`);
        const width = Math.max(...rows.map((r) => r.length));
        while (headers.length < width) headers.push(`Column ${headers.length + 1}`);
        setCsv({ fileName: file.name, headers, rows: [headers, ...rows.slice(1)] });
        setMapping(guessColumns(headers));
    };

    const clearFile = () => {
        setCsv(null);
        setCsvError(null);
        setMapping({ phone: null, name: null });
    };

    const variables = useMemo(
        () => (csv ? variableKeys(csv.headers, [mapping.phone, mapping.name]) : []),
        [csv, mapping.phone, mapping.name],
    );
    const countryInfo = campaignCountry(country) ?? CAMPAIGN_COUNTRIES[0];
    const check = useMemo(() => {
        if (!csv || mapping.phone === null) return null;
        return checkContacts(rowsToContactInputs(csv.rows, { phone: mapping.phone, name: mapping.name }, variables), countryInfo);
    }, [csv, mapping.phone, mapping.name, variables, countryInfo]);

    const toggleDay = (day: VoiceCampaignDay) =>
        setCallWindow((w) => ({ ...w, days: w.days.includes(day) ? w.days.filter((d) => d !== day) : [...w.days, day] }));
    const toggleRetryOn = (outcome: VoiceCampaignRetryOutcome) =>
        setRetry((r) => ({ ...r, on: r.on.includes(outcome) ? r.on.filter((o) => o !== outcome) : [...r.on, outcome] }));

    const stepProblem = (index: number): string | null => {
        if (index === 0) {
            if (!name.trim()) return 'Give the campaign a name';
            if (!agentId) return 'Pick the agent that places the calls';
            if (!numberId) return 'Pick the number to call from';
        }
        if (index === 1) {
            if (!csv) return 'Upload a CSV of contacts';
            if (mapping.phone === null) return 'Pick the column with the phone numbers';
            if (!check || check.contacts.length === 0) return 'No valid phone numbers in that column';
            if (check.contacts.length > VOICE_CAMPAIGN_LIMITS.maxContacts)
                return `A campaign holds at most ${VOICE_CAMPAIGN_LIMITS.maxContacts.toLocaleString()} contacts`;
        }
        if (index === 2) {
            if (callWindow.days.length === 0) return 'Pick at least one calling day';
            if (!callWindow.start || !callWindow.end || callWindow.start >= callWindow.end) return 'Calling hours must end after they start';
            if (retry.maxRetries > 0 && retry.on.length === 0) return 'Pick what to retry, or set retries to none';
        }
        return null;
    };
    const problem = stepProblem(step);
    const next = () => !problem && setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
    const back = () => setStep((s) => Math.max(s - 1, 0));
    const goTo = (index: number) => {
        // Only back, or forward over steps that are already complete.
        for (let i = 0; i < index; i++) if (stepProblem(i)) return;
        setStep(index);
    };

    const submit = async (start: boolean) => {
        if (!check || submitting) return;
        setSubmitError(null);
        setSubmitting(start ? 'start' : 'draft');
        const created = await createVoiceCampaign({
            name,
            agentId,
            numberId,
            window: callWindow,
            maxConcurrent,
            retry,
            defaultCountry: country,
            variableKeys: variables.map((v) => v.key),
        });
        if (!created.success || !created.data) {
            setSubmitting(null);
            setSubmitError(created.error ?? 'Could not create the campaign');
            return;
        }
        const id = created.data.id;
        const contacts = check.contacts;
        setUploaded({ sent: 0, total: contacts.length });
        for (let i = 0; i < contacts.length; i += CONTACTS_PER_REQUEST) {
            const res = await addVoiceCampaignContacts(id, contacts.slice(i, i + CONTACTS_PER_REQUEST));
            if (!res.success) {
                // Half a contact list is worse than none: drop the draft and let them try again.
                await deleteVoiceCampaign(id);
                setSubmitting(null);
                setUploaded(null);
                setSubmitError(res.error ?? 'Could not save the contacts');
                return;
            }
            setUploaded({ sent: Math.min(i + CONTACTS_PER_REQUEST, contacts.length), total: contacts.length });
        }
        if (start) {
            const started = await setVoiceCampaignStatus(id, 'start');
            if (!started.success) {
                toast.error(`Saved as a draft, but it could not start: ${started.error ?? 'unknown error'}`);
                router.push(campaignUrl(id));
                return;
            }
            toast.success(`${name.trim()} is running`);
        } else {
            toast.success(`${name.trim()} saved as a draft`);
        }
        router.push(campaignUrl(id));
    };

    return {
        agents,
        numbers,
        loadError: data.loadError,
        step,
        next,
        back,
        goTo,
        problem,
        name,
        setName,
        agentId,
        setAgentId,
        numberId,
        setNumberId,
        country,
        setCountry,
        countryInfo,
        csv,
        csvError,
        readFile,
        clearFile,
        mapping,
        setMapping,
        variables,
        check,
        callWindow,
        setCallWindow,
        toggleDay,
        maxConcurrent,
        setMaxConcurrent,
        retry,
        setRetry,
        toggleRetryOn,
        submit,
        submitting,
        uploaded,
        submitError,
    };
}

export type UseNewCampaignPageReturn = ReturnType<typeof useNewCampaignPage>;
