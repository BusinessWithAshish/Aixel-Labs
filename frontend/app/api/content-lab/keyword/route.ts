import { API_ENDPOINTS } from '@aixellabs/backend/config';
import { CONTENT_LAB_KEYWORD_REQUEST_SCHEMA } from '@aixellabs/backend/content-lab/schemas';
import { handleContentLabProxy } from '@/server/content-lab/backend';

export const maxDuration = 30;

/** How much a topic is searched on YouTube and where it is heading. Abortable: each new keystroke cancels the last. */
export function POST(request: Request) {
    return handleContentLabProxy(request, CONTENT_LAB_KEYWORD_REQUEST_SCHEMA, API_ENDPOINTS.CONTENT_LAB.KEYWORD.full);
}
