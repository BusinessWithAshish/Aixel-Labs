import { z } from 'zod';
import {
    VOICE_AGENT_FEATURE_LIMITS,
    VOICE_AGENT_LIMITS,
    VOICE_AGENT_VOICES,
    VOICE_ANALYSIS_FIELD_TYPES,
    VOICE_BOOKING_LIMITS,
    VOICE_CAMPAIGN_END_PATTERN,
    VOICE_CAMPAIGN_LIMITS,
    VOICE_RESERVED_TOOL_NAMES,
    VOICE_TIME_PATTERN,
    VOICE_TOOL_NAME_PATTERN,
    VOICE_TOOL_PARAM_NAME_PATTERN,
    VOICE_VARIABLE_NAME_PATTERN,
    VOICE_WEBHOOK_LIMITS,
    VOICE_WEBHOOK_PARAM_TYPES,
    VOICE_WEEKDAYS,
    VoiceAgentCallType,
    type VoiceAgentVoice,
    VoiceCalendarProvider,
    VoiceCampaignRetryOutcome,
    VoiceReplyWait,
    VoiceToolWait,
    VoiceVoicemailAction,
    type VoiceWeekday,
} from '@aixellabs/backend/db/types';
import { isValidObjectId } from '@/helpers/object-id';
import { isBuiltinVariable } from '@/helpers/voice-agent-features';
import { campaignCountry } from '@/helpers/voice-campaign-contacts';
import { voiceCalendarProviderInfo } from '@/helpers/voice-calendar-providers';
import { isIanaTimezone, minutesOf, VOICE_WEEKDAY_OPTIONS } from '@/helpers/voice-time';

/**
 * Validation for everything a voice owner saves: the forms resolve with these and the server actions
 * parse with the same ones, so a form shows the message the server would give.
 */

const LIMITS = VOICE_AGENT_FEATURE_LIMITS;

/** The first message in a failed parse. */
export function firstIssue(error: z.ZodError, fallback: string): string {
    return error.issues[0]?.message ?? fallback;
}

/** The first thing that stops `value` from parsing, or null: a form's one-line summary, in the server's words. */
export function schemaProblem(schema: z.ZodTypeAny, value: unknown): string | null {
    const parsed = schema.safeParse(value);
    return parsed.success ? null : firstIssue(parsed.error, 'Check the form');
}

/** Parses or throws the first message, for server actions. */
export function parseOrThrow<S extends z.ZodTypeAny>(schema: S, input: unknown, fallback: string): z.output<S> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new Error(firstIssue(parsed.error, fallback));
    return parsed.data;
}

const custom = (ctx: z.RefinementCtx, message: string, path: (string | number)[] = []) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

const VOICE_KEYS = Object.keys(VOICE_AGENT_VOICES) as [VoiceAgentVoice, ...VoiceAgentVoice[]];

/** Variable values by name: well-formed names, not a built-in, empty values dropped. */
const variableValuesSchema = z
    .record(
        z
            .string()
            .regex(
                VOICE_VARIABLE_NAME_PATTERN,
                'Variable names are lowercase letters, numbers and _, starting with a letter',
            )
            .refine((name) => !isBuiltinVariable(name), 'Built-in variables get their value on each call'),
        z.string().max(LIMITS.maxVariableLength, `Variable values are up to ${LIMITS.maxVariableLength} characters`),
    )
    .transform((values): Record<string, string> =>
        Object.fromEntries(Object.entries(values).flatMap(([k, v]) => (v?.trim() ? [[k, v.trim()]] : []))),
    )
    .refine(
        (values) => Object.keys(values).length <= LIMITS.maxVariables,
        `Up to ${LIMITS.maxVariables} variables have default values`,
    );

export const voiceAgentSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, 'Name is required')
        .max(VOICE_AGENT_LIMITS.nameMax, `Name must be ${VOICE_AGENT_LIMITS.nameMax} characters or fewer`),
    callType: z.nativeEnum(VoiceAgentCallType, { errorMap: () => ({ message: 'Pick inbound or outbound' }) }),
    voice: z.enum(VOICE_KEYS, { errorMap: () => ({ message: 'Pick one of the listed voices' }) }),
    prompt: z
        .string()
        .trim()
        .min(1, 'Prompt is required')
        .max(
            VOICE_AGENT_LIMITS.promptMax,
            `Prompt must be ${VOICE_AGENT_LIMITS.promptMax.toLocaleString('en-US')} characters or fewer`,
        ),
    callNotes: z
        .string()
        .trim()
        .max(
            VOICE_AGENT_LIMITS.callNotesMax,
            `Call notes must be ${VOICE_AGENT_LIMITS.callNotesMax.toLocaleString('en-US')} characters or fewer`,
        ),
    /** Default values for the prompt's `{{variables}}` (empty ones are not kept). */
    variables: variableValuesSchema,
});

export type VoiceAgentInput = z.input<typeof voiceAgentSchema>;

// ---------------------------------------------------------------------------
// Call settings: voicemail, post-call analysis, caller memory, speech
// ---------------------------------------------------------------------------

const voicemailSchema = z
    .object({
        action: z.nativeEnum(VoiceVoicemailAction, { errorMap: () => ({ message: 'Pick what to do on a voicemail' }) }),
        message: z
            .string()
            .trim()
            .max(
                LIMITS.voicemailMessageMax,
                `The voicemail message is up to ${LIMITS.voicemailMessageMax} characters (about 30 seconds)`,
            ),
    })
    .strict()
    .refine((vm) => vm.action !== VoiceVoicemailAction.MESSAGE || vm.message.length > 0, {
        message: 'Write the message to leave',
        path: ['message'],
    });

/** A choice field's answers: a list, or as typed in the editor (one comma-separated line). */
const choiceOptionsSchema = z
    .union([
        z.string().transform((text) =>
            text
                .split(',')
                .map((option) => option.trim())
                .filter(Boolean),
        ),
        z.array(z.string()),
    ])
    .pipe(
        z
            .array(
                z
                    .string()
                    .trim()
                    .min(1, 'Choices cannot be empty')
                    .max(LIMITS.choiceOptionMax, `Choices are up to ${LIMITS.choiceOptionMax} characters`),
            )
            .max(LIMITS.maxChoiceOptions, `A choice field has up to ${LIMITS.maxChoiceOptions} answers`),
    );

const analysisFieldSchema = z
    .object({
        name: z
            .string()
            .trim()
            .regex(
                VOICE_VARIABLE_NAME_PATTERN,
                'Field names are lowercase letters, numbers and _, starting with a letter (like budget)',
            ),
        type: z.enum(VOICE_ANALYSIS_FIELD_TYPES, { errorMap: () => ({ message: 'Pick a field type' }) }),
        description: z
            .string()
            .trim()
            .min(1, 'Say what each field means')
            .max(LIMITS.analysisDescriptionMax, `Field descriptions are up to ${LIMITS.analysisDescriptionMax} characters`),
        options: choiceOptionsSchema.optional(),
    })
    .strict()
    .superRefine((field, ctx) => {
        const options = field.type === 'choice' ? (field.options ?? []) : [];
        if (field.type === 'choice' && options.length < 2) {
            custom(ctx, `Give ${field.name} at least two answers to choose from`, ['options']);
        }
        if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
            custom(ctx, `${field.name} lists the same answer twice`, ['options']);
        }
    })
    .transform(({ options, ...field }) => (field.type === 'choice' ? { ...field, options } : field));

const analysisSchema = z
    .object({
        summary: z.boolean(),
        sentiment: z.boolean(),
        success: z.boolean(),
        successDefinition: z
            .string()
            .trim()
            .max(
                LIMITS.successDefinitionMax,
                `The definition of success is up to ${LIMITS.successDefinitionMax} characters`,
            ),
        fields: z
            .array(analysisFieldSchema)
            .max(LIMITS.maxAnalysisFields, `Up to ${LIMITS.maxAnalysisFields} custom fields`),
    })
    .strict()
    .superRefine((analysis, ctx) => {
        if (analysis.success && !analysis.successDefinition) {
            custom(ctx, 'Say what makes a call successful', ['successDefinition']);
        }
        const names = analysis.fields.map((f) => f.name);
        const twice = names.find((name, i) => names.indexOf(name) !== i);
        if (twice) custom(ctx, `There are two fields called ${twice}`, ['fields']);
    });

const speechSchema = z
    .object({
        toolWait: z.nativeEnum(VoiceToolWait, {
            errorMap: () => ({ message: 'Pick what the agent does while a tool works' }),
        }),
        toolWaitLine: z
            .string()
            .trim()
            .max(LIMITS.toolWaitLineMax, `The line is up to ${LIMITS.toolWaitLineMax} characters`),
        replyWait: z.nativeEnum(VoiceReplyWait, { errorMap: () => ({ message: 'Pick how long the agent waits' }) }),
        silenceSecs: z
            .number({ invalid_type_error: 'Give the seconds of silence, or 0 for never' })
            .int('Whole seconds only')
            .refine(
                (secs) => secs === 0 || (secs >= LIMITS.silenceSecsMin && secs <= LIMITS.silenceSecsMax),
                `Silence is ${LIMITS.silenceSecsMin} to ${LIMITS.silenceSecsMax} seconds, or 0 for never`,
            ),
        maxCallMinutes: z
            .number({ invalid_type_error: 'Give the minutes, or 0 for no limit' })
            .int('Whole minutes only')
            .min(0, 'Give the minutes, or 0 for no limit')
            .max(LIMITS.maxCallMinutesMax, `Calls can be limited to ${LIMITS.maxCallMinutesMax} minutes at most`),
    })
    .strict()
    .refine((speech) => speech.toolWait !== VoiceToolWait.SAY || speech.toolWaitLine.length > 0, {
        message: 'Write the line to say while a tool works',
        path: ['toolWaitLine'],
    });

/** How the agent behaves around a call: on voicemail, after it (analysis), from one call to the next (memory), and how it speaks. */
export const callSettingsSchema = z
    .object({ voicemail: voicemailSchema, analysis: analysisSchema, memory: z.boolean(), speech: speechSchema })
    .strict();

export type VoiceAgentCallSettingsInput = z.input<typeof callSettingsSchema>;

// ---------------------------------------------------------------------------
// Appointment booking
// ---------------------------------------------------------------------------

const bookingTimeSchema = z.string().regex(VOICE_TIME_PATTERN, 'Times are 24-hour HH:MM, like 09:00');
const bookingDaySchema = z.object({ open: bookingTimeSchema, close: bookingTimeSchema }).strict();

const weekdayLabel = (day: VoiceWeekday) => VOICE_WEEKDAY_OPTIONS.find((d) => d.key === day)?.label ?? day;

const DAYS_AHEAD_RANGE = `Callers can book from ${VOICE_BOOKING_LIMITS.maxDaysAheadMin} to ${VOICE_BOOKING_LIMITS.maxDaysAheadMax} days ahead`;

const bookingRules = {
    enabled: z.boolean(),
    timezone: z.string().trim().min(1, 'Pick a timezone').refine(isIanaTimezone, 'Pick a timezone from the list'),
    slotMinutes: z
        .number({ invalid_type_error: 'Pick an appointment length' })
        .int('Appointment length is a whole number of minutes')
        .min(VOICE_BOOKING_LIMITS.slotMinutesMin, `Appointments are at least ${VOICE_BOOKING_LIMITS.slotMinutesMin} minutes`)
        .max(VOICE_BOOKING_LIMITS.slotMinutesMax, `Appointments are at most ${VOICE_BOOKING_LIMITS.slotMinutesMax} minutes`)
        .multipleOf(
            VOICE_BOOKING_LIMITS.slotMinutesStep,
            `Appointment length goes in steps of ${VOICE_BOOKING_LIMITS.slotMinutesStep} minutes`,
        ),
    maxDaysAhead: z.coerce
        .number({ invalid_type_error: DAYS_AHEAD_RANGE })
        .int(DAYS_AHEAD_RANGE)
        .min(VOICE_BOOKING_LIMITS.maxDaysAheadMin, DAYS_AHEAD_RANGE)
        .max(VOICE_BOOKING_LIMITS.maxDaysAheadMax, DAYS_AHEAD_RANGE),
    /** Null = the built-in calendar. Ownership is checked against the owner's connected apps (voice_accounts.calendars) on save. */
    destination: z
        .object({
            provider: z.nativeEnum(VoiceCalendarProvider, {
                errorMap: () => ({ message: 'Pick one of the connected apps' }),
            }),
            connectedAccountId: z
                .string()
                .trim()
                .regex(/^[A-Za-z0-9_-]{3,100}$/, 'Pick one of the connected apps'),
            calendarId: z.string().trim().max(500, 'Pick a calendar from the list'),
            calendarName: z.string().trim().max(200, 'Pick a calendar from the list'),
        })
        .strict()
        .superRefine((destination, ctx) => {
            if (destination.calendarId && destination.calendarName) return;
            const target = voiceCalendarProviderInfo(destination.provider).targetNoun.toLowerCase();
            custom(ctx, `Choose the ${target} bookings go to`, ['calendarId']);
        })
        .nullable()
        .optional(),
};

/** Booking settings as stored: open days only. */
export const bookingToolSchema = z
    .object({
        ...bookingRules,
        hours: z
            .object(
                Object.fromEntries(VOICE_WEEKDAYS.map((day) => [day, bookingDaySchema.optional()])) as Record<
                    VoiceWeekday,
                    z.ZodOptional<typeof bookingDaySchema>
                >,
            )
            .strict(),
    })
    .strict()
    .superRefine((booking, ctx) => {
        for (const day of VOICE_WEEKDAYS) {
            const hours = booking.hours[day];
            if (!hours) continue;
            const open = minutesOf(hours.open);
            const close = minutesOf(hours.close);
            if (close <= open) {
                custom(ctx, `${weekdayLabel(day)} has to close after it opens`, ['hours', day]);
            } else if (close - open < booking.slotMinutes) {
                custom(ctx, `${weekdayLabel(day)}'s hours are shorter than one ${booking.slotMinutes}-minute appointment`, [
                    'hours',
                    day,
                ]);
            }
        }
        if (booking.enabled && VOICE_WEEKDAYS.every((day) => !booking.hours[day])) {
            custom(ctx, 'Open at least one day so callers can book', ['hours']);
        }
    });

export type VoiceAgentBookingInput = z.input<typeof bookingToolSchema>;

/** One day in the editor. A closed day keeps its times, so switching it back on restores them. */
const bookingDayFormSchema = z.object({
    open: z.boolean(),
    from: z.string(),
    to: z.string(),
});

/** The booking settings as the editor holds them; resolves to what is stored. */
export const bookingFormSchema = z
    .object({
        ...bookingRules,
        days: z.object(
            Object.fromEntries(VOICE_WEEKDAYS.map((day) => [day, bookingDayFormSchema])) as Record<
                VoiceWeekday,
                typeof bookingDayFormSchema
            >,
        ),
    })
    .transform(({ days, destination, ...rules }) => ({
        ...rules,
        destination: destination ?? null,
        hours: Object.fromEntries(
            VOICE_WEEKDAYS.flatMap((day) => (days[day].open ? [[day, { open: days[day].from, close: days[day].to }]] : [])),
        ),
    }))
    .pipe(bookingToolSchema);

export type BookingFormValues = z.input<typeof bookingFormSchema>;

// ---------------------------------------------------------------------------
// Custom webhook tools
// ---------------------------------------------------------------------------

const webhookParamSchema = z
    .object({
        name: z
            .string()
            .trim()
            .regex(
                VOICE_TOOL_PARAM_NAME_PATTERN,
                'Parameter names are lowercase letters, numbers and _, starting with a letter (like order_id)',
            ),
        type: z.enum(VOICE_WEBHOOK_PARAM_TYPES, { errorMap: () => ({ message: 'Pick a parameter type' }) }),
        description: z
            .string()
            .trim()
            .max(
                VOICE_WEBHOOK_LIMITS.paramDescriptionMax,
                `Parameter descriptions are up to ${VOICE_WEBHOOK_LIMITS.paramDescriptionMax} characters`,
            ),
        required: z.boolean(),
    })
    .strict();

/** What the editor sends for a custom tool's signing secret. It is never sent back. */
const webhookSecretSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('keep') }),
    z.object({ action: z.literal('clear') }),
    z.object({
        action: z.literal('set'),
        value: z
            .string()
            .trim()
            .min(1, 'Enter the secret, or leave it unset')
            .max(VOICE_WEBHOOK_LIMITS.secretMax, `The secret is up to ${VOICE_WEBHOOK_LIMITS.secretMax} characters`),
    }),
]);

export type VoiceWebhookSecretInput = z.input<typeof webhookSecretSchema>;

/** A custom tool's name, as the model sees it. */
const toolNameSchema = z
    .string()
    .trim()
    .min(1, 'Give the tool a name, like check_order')
    .regex(
        VOICE_TOOL_NAME_PATTERN,
        'Tool names are 2 to 40 lowercase letters, numbers and _, starting with a letter (like check_order)',
    )
    .refine(
        (name) => !(VOICE_RESERVED_TOOL_NAMES as readonly string[]).includes(name),
        'That name belongs to a built-in tool. Pick another one.',
    );

const webhookToolFields = z.object({
    name: toolNameSchema,
    description: z
        .string()
        .trim()
        .min(1, 'Say when the agent should use this tool')
        .max(
            VOICE_WEBHOOK_LIMITS.descriptionMax,
            `The description is up to ${VOICE_WEBHOOK_LIMITS.descriptionMax} characters`,
        ),
    url: z
        .string()
        .trim()
        .min(1, 'Enter the URL to call')
        .max(VOICE_WEBHOOK_LIMITS.urlMax, 'That URL is too long')
        .regex(/^https?:\/\/[^/\s]+/i, 'Enter a full URL, starting with https://'),
    parameters: z
        .array(webhookParamSchema)
        .max(VOICE_WEBHOOK_LIMITS.maxParams, `A tool has up to ${VOICE_WEBHOOK_LIMITS.maxParams} parameters`),
    enabled: z.boolean(),
    secret: webhookSecretSchema,
});

function uniqueParamNames(tool: { parameters: { name: string }[] }, ctx: z.RefinementCtx) {
    const names = tool.parameters.map((p) => p.name);
    const twice = names.find((name, i) => names.indexOf(name) !== i);
    if (twice) custom(ctx, `There are two parameters called ${twice}`, ['parameters']);
}

export const webhookToolSchema = webhookToolFields.superRefine(uniqueParamNames);

export type VoiceWebhookToolInput = z.input<typeof webhookToolSchema>;

/** A test needs a working URL and parameters, not the description yet. */
export const webhookTestSchema = webhookToolFields.omit({ description: true, enabled: true }).superRefine(uniqueParamNames);

export type VoiceWebhookTestInput = z.input<typeof webhookTestSchema>;

/** The secret as the dialog edits it: keep the saved one, type a new one, or remove it. */
export type WebhookSecretMode = VoiceWebhookSecretInput['action'];

/**
 * The tool dialog's values; resolves to what is saved. `hasSecret` and `otherNames` describe the saved
 * agent (a secret is never sent to the browser; names are unique per agent).
 */
export function webhookToolFormSchema(hasSecret: boolean, otherNames: string[]) {
    return webhookToolFields
        .extend({
            name: toolNameSchema.superRefine((name, ctx) => {
                if (otherNames.includes(name)) custom(ctx, `This agent already has a tool called ${name}`);
            }),
            secret: z.object({ action: z.enum(['keep', 'set', 'clear']), value: z.string() }),
        })
        .superRefine((tool, ctx) => {
            uniqueParamNames(tool, ctx);
            if (hasSecret && tool.secret.action === 'set' && !tool.secret.value.trim()) {
                custom(ctx, 'Enter the new secret, or keep the current one', ['secret', 'value']);
            }
        })
        .transform(({ secret, ...tool }) => ({ ...tool, secret: webhookSecretInput(secret) }));
}

/** The dialog's secret as sent: a new value, keep the saved one, or none (an empty new secret goes unsigned). */
export function webhookSecretInput(secret: { action: WebhookSecretMode; value: string }): VoiceWebhookSecretInput {
    const value = secret.value.trim();
    if (secret.action === 'set' && value) return { action: 'set', value };
    return { action: secret.action === 'keep' ? 'keep' : 'clear' };
}

export type WebhookToolFormValues = z.input<ReturnType<typeof webhookToolFormSchema>>;

// ---------------------------------------------------------------------------
// Outbound campaigns
// ---------------------------------------------------------------------------

const objectIdSchema = (message: string) => z.string().refine(isValidObjectId, message);

export const campaignDetailsSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, 'Give the campaign a name')
        .max(VOICE_CAMPAIGN_LIMITS.nameMax, `Keep the name under ${VOICE_CAMPAIGN_LIMITS.nameMax} characters`),
    agentId: objectIdSchema('Pick the agent that places the calls'),
    numberId: objectIdSchema('Pick the number to call from'),
});

export const campaignScheduleSchema = z.object({
    window: z
        .object({
            days: z
                .array(z.enum(VOICE_WEEKDAYS))
                .transform((days) => VOICE_WEEKDAYS.filter((day) => days.includes(day)))
                .refine((days) => days.length > 0, 'Pick at least one calling day'),
            start: z.string().regex(VOICE_TIME_PATTERN, 'Calling hours must be times like 09:00'),
            end: z.string().regex(VOICE_CAMPAIGN_END_PATTERN, 'Calling hours must be times like 09:00'),
            timezone: z.string().refine(isIanaTimezone, 'Pick a valid timezone'),
        })
        .refine((w) => minutesOf(w.start) < minutesOf(w.end), {
            message: 'Calling hours must end after they start',
            path: ['end'],
        }),
    maxConcurrent: z
        .number()
        .int()
        .min(1, `Calls at once must be 1 to ${VOICE_CAMPAIGN_LIMITS.maxConcurrent}`)
        .max(VOICE_CAMPAIGN_LIMITS.maxConcurrent, `Calls at once must be 1 to ${VOICE_CAMPAIGN_LIMITS.maxConcurrent}`),
    retry: z
        .object({
            maxRetries: z
                .number()
                .int()
                .min(0, `Retries must be 0 to ${VOICE_CAMPAIGN_LIMITS.maxRetries}`)
                .max(VOICE_CAMPAIGN_LIMITS.maxRetries, `Retries must be 0 to ${VOICE_CAMPAIGN_LIMITS.maxRetries}`),
            delayMinutes: z
                .number()
                .int()
                .min(VOICE_CAMPAIGN_LIMITS.minRetryDelayMinutes, 'Pick a delay between retries')
                .max(VOICE_CAMPAIGN_LIMITS.maxRetryDelayMinutes, 'Pick a delay between retries'),
            on: z
                .array(z.nativeEnum(VoiceCampaignRetryOutcome))
                .transform((on) => Object.values(VoiceCampaignRetryOutcome).filter((o) => on.includes(o))),
        })
        .refine((r) => r.maxRetries === 0 || r.on.length > 0, {
            message: 'Pick what to retry: no answer, busy or voicemail',
            path: ['on'],
        }),
});

/** Everything a campaign is created with, apart from its contacts. */
export const campaignSettingsSchema = campaignDetailsSchema.merge(campaignScheduleSchema).extend({
    defaultCountry: z.string().refine((code) => !!campaignCountry(code), 'Pick the country for numbers without a +'),
    /** The CSV's extra columns, as variable names. */
    variableKeys: z
        .array(z.string())
        .transform((keys) =>
            [...new Set(keys.filter((key) => VOICE_VARIABLE_NAME_PATTERN.test(key)))].slice(
                0,
                VOICE_CAMPAIGN_LIMITS.maxVariables,
            ),
        ),
});

export type VoiceCampaignSettingsInput = z.input<typeof campaignSettingsSchema>;

// ---------------------------------------------------------------------------
// Phone numbers
// ---------------------------------------------------------------------------

/** What a number does, as its Change dialog edits it: answer calls, make calls, or nothing, and with which agent. */
export const numberJobSchema = z
    .object({
        job: z.enum([VoiceAgentCallType.INBOUND, VoiceAgentCallType.OUTBOUND, 'NONE']),
        agentId: z.string(),
    })
    .refine((v) => v.job === 'NONE' || isValidObjectId(v.agentId), { message: 'Choose an agent', path: ['agentId'] });

export type NumberJobFormValues = z.input<typeof numberJobSchema>;
