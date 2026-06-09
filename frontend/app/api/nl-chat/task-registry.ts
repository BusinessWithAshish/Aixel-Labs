import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { GMAPS_REQUEST_FIELDS_SCHEMA, GMAPS_REQUEST_SCHEMA } from '@aixellabs/backend/gmaps';
import { z } from 'zod';

const BASE_PROMPT =
    'You are a lead generation assistant. Put extracted fields in draftUpdates. Use intent collect | confirm | submit. Ask 1-2 things at a time. Never output JSON or raw field names in reply. Extract every geographic place the user implies into cities, state, and country as applicable.';

export const TURN_INTENT = z.enum(['collect', 'confirm', 'submit']);
export type TurnIntent = z.infer<typeof TURN_INTENT>;

export type TurnModelOutput = {
    reply: string;
    draftUpdates: Record<string, unknown>;
    intent: TurnIntent;
};

export function createTurnSchema(draftUpdatesSchema: z.ZodTypeAny) {
    return z.object({
        reply: z.string(),
        draftUpdates: draftUpdatesSchema,
        intent: TURN_INTENT,
    });
}

export const GMAPS_TURN_SCHEMA = createTurnSchema(GMAPS_REQUEST_FIELDS_SCHEMA.partial());

const STUB_SCHEMA = z.object({});
const STUB_TURN_SCHEMA = createTurnSchema(z.object({}).partial());

export type NlChatModule =
    | typeof LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS
    | typeof LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH
    | typeof LEAD_GENERATION_SUB_MODULES.LINKEDIN;

type ImplementedTaskConfig = {
    schema: z.ZodTypeAny;
    turnSchema: z.ZodTypeAny;
    systemPrompt: string;
    implemented: true;
};

type UnimplementedTaskConfig = {
    schema: typeof STUB_SCHEMA;
    turnSchema: typeof STUB_TURN_SCHEMA;
    systemPrompt: string;
    implemented: false;
};

export type TaskConfig = ImplementedTaskConfig | UnimplementedTaskConfig;

export const TASK_REGISTRY = {
    [LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS]: {
        schema: GMAPS_REQUEST_SCHEMA,
        turnSchema: GMAPS_TURN_SCHEMA,
        systemPrompt: `${BASE_PROMPT}\n\nModule: Google Maps lead search.`,
        implemented: true as const,
    },
    [LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH]: {
        schema: STUB_SCHEMA,
        turnSchema: STUB_TURN_SCHEMA,
        systemPrompt: '',
        implemented: false as const,
    },
    [LEAD_GENERATION_SUB_MODULES.LINKEDIN]: {
        schema: STUB_SCHEMA,
        turnSchema: STUB_TURN_SCHEMA,
        systemPrompt: '',
        implemented: false as const,
    },
} as const satisfies Record<NlChatModule, TaskConfig>;

export function isImplementedTask(config: TaskConfig): config is ImplementedTaskConfig {
    return config.implemented;
}
