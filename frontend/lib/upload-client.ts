import type { ALApiResponse } from '@aixellabs/backend/api/types';
import { createUploadInit } from '@/app/actions/upload-actions';

const STORAGE_KEY_PREFIX = 'aixellabs:file-upload:';
const MAX_CHUNK_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 500;

export type UploadProgress = {
    bytesSent: number;
    totalBytes: number;
    percent: number;
};

export type UploadResult = {
    path: string;
    filename: string;
    size: number;
};

export type UploadFileOptions = {
    /** Overrides the file's original name; sent as `filename` on `init`. */
    filename?: string;
    onProgress?: (progress: UploadProgress) => void;
    signal?: AbortSignal;
};

type StoredUploadState = {
    uploadId: string;
    token: string;
    filename: string;
    chunkSize: number;
};

function getUploadOrigin(): string {
    const origin = process.env.NEXT_PUBLIC_BE_UPLOAD_ORIGIN?.trim();
    if (!origin) {
        throw new Error('Upload origin is not configured');
    }
    return origin;
}

/** Stable per-file identity used to resume an upload across a page reload. */
function getFileFingerprint(file: File): string {
    return `${file.name}:${file.size}:${file.lastModified}`;
}

function storageKey(fingerprint: string): string {
    return `${STORAGE_KEY_PREFIX}${fingerprint}`;
}

function readStoredUpload(fingerprint: string): StoredUploadState | null {
    try {
        const raw = window.localStorage.getItem(storageKey(fingerprint));
        if (!raw) return null;
        return JSON.parse(raw) as StoredUploadState;
    } catch {
        return null;
    }
}

function writeStoredUpload(fingerprint: string, state: StoredUploadState): void {
    try {
        window.localStorage.setItem(storageKey(fingerprint), JSON.stringify(state));
    } catch {
        // best-effort; ignore quota / private-mode failures
    }
}

function clearStoredUpload(fingerprint: string): void {
    try {
        window.localStorage.removeItem(storageKey(fingerprint));
    } catch {
        // ignore
    }
}

async function parseApiResponse<T>(response: Response): Promise<T> {
    const payload = (await response.json().catch(() => null)) as ALApiResponse<T> | null;
    if (!response.ok || !payload?.success || !payload.data) {
        throw new Error(payload?.error || `Request failed (${response.status})`);
    }
    return payload.data;
}

async function getUploadStatus(
    uploadId: string,
    token: string,
): Promise<{ bytesReceived: number; size: number; complete: boolean }> {
    const response = await fetch(`${getUploadOrigin()}/media/upload/${uploadId}/status`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    return parseApiResponse(response);
}

async function completeUpload(uploadId: string, token: string): Promise<UploadResult> {
    const response = await fetch(`${getUploadOrigin()}/media/upload/${uploadId}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
    });
    return parseApiResponse(response);
}

function uploadChunkOnce(
    uploadId: string,
    token: string,
    offset: number,
    chunk: Blob,
    onLoaded: (loadedBytes: number) => void,
    signal?: AbortSignal,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', `${getUploadOrigin()}/media/upload/${uploadId}/chunk`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('X-Chunk-Offset', String(offset));
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                onLoaded(event.loaded);
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
                return;
            }
            let message = `Chunk upload failed (${xhr.status})`;
            try {
                const payload = JSON.parse(xhr.responseText) as ALApiResponse<unknown>;
                if (payload?.error) message = payload.error;
            } catch {
                // keep default message
            }
            reject(new Error(message));
        };

        xhr.onerror = () => reject(new Error('Network error while uploading chunk'));
        xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));

        if (signal) {
            if (signal.aborted) {
                xhr.abort();
                return;
            }
            signal.addEventListener('abort', () => xhr.abort(), { once: true });
        }

        xhr.send(chunk);
    });
}

async function uploadChunkWithRetry(
    uploadId: string,
    token: string,
    offset: number,
    chunk: Blob,
    onLoaded: (loadedBytes: number) => void,
    signal?: AbortSignal,
): Promise<void> {
    let attempt = 0;
    for (;;) {
        try {
            await uploadChunkOnce(uploadId, token, offset, chunk, onLoaded, signal);
            return;
        } catch (error) {
            attempt += 1;
            const isAbort = error instanceof DOMException && error.name === 'AbortError';
            if (isAbort || signal?.aborted || attempt >= MAX_CHUNK_RETRIES) {
                throw error instanceof Error ? error : new Error('Chunk upload failed');
            }
            const delay = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
}

/**
 * Uploads a file directly from the browser to the VPS backend's public upload
 * origin, bypassing the Next.js server (see `app/actions/upload-actions.ts` for
 * the `init` call, which is the only leg that goes through the Next server).
 *
 * Uploads chunks sequentially and resumes from the last confirmed byte offset
 * when the same file (by name/size/lastModified fingerprint) is dropped again
 * after a page reload.
 */
export async function uploadFile(file: File, options: UploadFileOptions = {}): Promise<UploadResult> {
    const requestedFilename = options.filename?.trim() || file.name;
    const fingerprint = getFileFingerprint(file);
    const totalBytes = file.size;

    const reportProgress = (bytesSent: number) => {
        const percent = totalBytes === 0 ? 100 : Math.min(100, Math.round((bytesSent / totalBytes) * 100));
        options.onProgress?.({ bytesSent, totalBytes, percent });
    };

    let uploadState = readStoredUpload(fingerprint);
    let bytesSent = 0;
    let alreadyComplete = false;

    if (uploadState) {
        try {
            const status = await getUploadStatus(uploadState.uploadId, uploadState.token);
            bytesSent = status.bytesReceived;
            alreadyComplete = status.complete;
        } catch {
            // Token likely expired or the upload no longer exists server-side — start fresh.
            uploadState = null;
            bytesSent = 0;
        }
    }

    if (!uploadState) {
        const initResponse = await createUploadInit({
            filename: requestedFilename,
            size: file.size,
            mimeType: file.type || undefined,
        });
        if (!initResponse.success || !initResponse.data) {
            throw new Error(initResponse.error || 'Failed to start upload');
        }
        uploadState = {
            uploadId: initResponse.data.uploadId,
            token: initResponse.data.token,
            filename: requestedFilename,
            chunkSize: initResponse.data.chunkSize,
        };
        bytesSent = 0;
        writeStoredUpload(fingerprint, uploadState);
    }

    const { uploadId, token, chunkSize } = uploadState;

    reportProgress(bytesSent);

    let offset = bytesSent;
    while (!alreadyComplete && offset < totalBytes) {
        if (options.signal?.aborted) {
            throw new DOMException('Upload aborted', 'AbortError');
        }

        const chunkStart = offset;
        const chunkEnd = Math.min(chunkStart + chunkSize, totalBytes);
        const chunk = file.slice(chunkStart, chunkEnd);

        await uploadChunkWithRetry(
            uploadId,
            token,
            chunkStart,
            chunk,
            (loadedInChunk) => reportProgress(chunkStart + loadedInChunk),
            options.signal,
        );

        offset = chunkEnd;
        writeStoredUpload(fingerprint, uploadState);
        reportProgress(offset);
    }

    const result = await completeUpload(uploadId, token);
    clearStoredUpload(fingerprint);
    reportProgress(totalBytes);
    return result;
}
