import { API_ENDPOINTS } from '@aixellabs/backend/config';
import { CONTENT_LAB_SUGGEST_REQUEST_SCHEMA } from '@aixellabs/backend/content-lab/schemas';
import { handleContentLabProxy } from '@/server/content-lab/backend';

export const maxDuration = 30;

/** Type-ahead: creators matching what the user has typed so far. Abortable: each new keystroke cancels the last. */
export function POST(request: Request) {
    return handleContentLabProxy(request, CONTENT_LAB_SUGGEST_REQUEST_SCHEMA, API_ENDPOINTS.CONTENT_LAB.SUGGEST.full);
}
