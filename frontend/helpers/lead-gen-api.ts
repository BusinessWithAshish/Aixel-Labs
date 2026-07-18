import 'server-only';

import type { ALApiResponse } from '@aixellabs/backend/api/types';
import { type LeadData, LEAD_GENERATION_SUB_MODULES, LeadSource } from '@aixellabs/backend/db/types';
import apiClient from '@/lib/api-client';
import { API_ENDPOINTS } from '@aixellabs/backend/config';

export function getLeadSoruceFromSubModule(subModule: LEAD_GENERATION_SUB_MODULES): LeadSource {
    switch (subModule) {
        case LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS:
            return LeadSource.GOOGLE_MAPS;
        case LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH:
            return LeadSource.INSTAGRAM;
        case LEAD_GENERATION_SUB_MODULES.LINKEDIN:
            return LeadSource.LINKEDIN;
        default:
            throw new Error('Method not implemented');
    }
}

/** `{presetName} · Sat 6:10 PM` — preset name is required; no submodule fallback. */
export function buildLeadListNameFromPreset(presetName: string): string {
    const now = new Date();
    const weekday = now.toLocaleDateString(undefined, { weekday: 'short' });
    const time = now.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
    return `${presetName.trim()} · ${weekday} ${time}`;
}

export type GenerateLeadsProps<TRequest> = {
    subModule: LEAD_GENERATION_SUB_MODULES;
    body: TRequest;
};

const getLeads = <TRequest>(source: LEAD_GENERATION_SUB_MODULES, body: TRequest): Promise<ALApiResponse<LeadData[]>> => {
    switch (source) {
        case LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS:
            return apiClient.post(API_ENDPOINTS.GMAPS.INTERNAL.full, body);
        case LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH:
            return apiClient.post(API_ENDPOINTS.INSTAGRAM.API.full, body);
        case LEAD_GENERATION_SUB_MODULES.LINKEDIN:
            return apiClient.post(API_ENDPOINTS.LINKEDIN.API.full, body);
        default:
            throw new Error('Method not implemented');
    }
};

export function generateLeads<TRequest>(options: GenerateLeadsProps<TRequest>): Promise<ALApiResponse<LeadData[]>> {
    const { subModule, body } = options;

    return getLeads(subModule, body);
}
