export enum Modules {
    LEAD_GENERATION = 'Lead Generation',
    VOICE_AGENT = 'Voice Agent',
    MESSAGING = 'Messaging',
    EMAIL = 'Email',
}

export const ModuleUrls = {
    [Modules.LEAD_GENERATION]: '/lead-generation',
    [Modules.VOICE_AGENT]: '/voice-agent',
    [Modules.MESSAGING]: '/messaging',
    [Modules.EMAIL]: '/email',
};

export const BACKEND_URL = process.env.NEXT_PUBLIC_BE_API;
