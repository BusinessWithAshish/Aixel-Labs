import { API_ENDPOINTS } from '@aixellabs/backend/config';
import { CONTENT_LAB_CHECK_REQUEST_SCHEMA } from '@aixellabs/backend/content-lab/schemas';
import { handleContentLabProxy } from '@/server/content-lab/backend';

export const maxDuration = 300;

/** Scores a draft title or hook against the niche's winners. Abortable: the browser's signal reaches the backend. */
export function POST(request: Request) {
    return handleContentLabProxy(request, CONTENT_LAB_CHECK_REQUEST_SCHEMA, API_ENDPOINTS.CONTENT_LAB.CHECK.full);
}
