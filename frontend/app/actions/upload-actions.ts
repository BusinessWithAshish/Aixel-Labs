'use server';

import { ALApiResponse } from '@aixellabs/backend/api/types';
import { assertRequiredTrimmedString, runAuthenticatedAction } from '@/helpers/server-action-helpers';
import { assertCallerIsAdmin } from '@/server/auth';

export type CreateUploadInitInput = {
    filename: string;
    size: number;
    mimeType?: string;
};

export type CreateUploadInitResult = {
    uploadId: string;
    token: string;
    chunkSize: number;
};

function getUploadOrigin(): string {
    const origin = process.env.NEXT_PUBLIC_BE_UPLOAD_ORIGIN?.trim();
    if (!origin) {
        throw new Error('Upload origin is not configured');
    }
    return origin;
}

/**
 * Admin-only: mints an upload session against the VPS backend's public upload origin.
 * The returned token is opaque — the browser carries it on every subsequent chunk /
 * status / complete call for this upload (see `lib/upload-client.ts`).
 */
export const createUploadInit = async (
    input: CreateUploadInitInput,
): Promise<ALApiResponse<CreateUploadInitResult>> =>
    runAuthenticatedAction(async function createUploadInit() {
        await assertCallerIsAdmin();

        assertRequiredTrimmedString(input.filename, 'Filename');
        if (!Number.isFinite(input.size) || input.size < 0) {
            throw new Error('File size is invalid');
        }

        const response = await fetch(`${getUploadOrigin()}/media/upload/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: input.filename,
                size: input.size,
                mimeType: input.mimeType,
            }),
        });

        const payload = (await response.json()) as ALApiResponse<CreateUploadInitResult>;
        if (!response.ok || !payload.success || !payload.data) {
            throw new Error(payload.error || 'Failed to initialize upload');
        }

        return payload.data;
    });
