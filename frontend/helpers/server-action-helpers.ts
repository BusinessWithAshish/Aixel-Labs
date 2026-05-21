import { auth } from '@/auth';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import { MongoObjectId } from '@aixellabs/backend/db';

const CRITICAL_LOG_PREFIX = '[critical]';

export function getActionErrorMessage(error: unknown, fallback = 'Request failed'): string {
    return error instanceof Error ? error.message : fallback;
}

export async function getCurrentUserId(): Promise<string | null> {
    const session = await auth();
    return session?.user?.id ?? null;
}

export async function withAuthentication<T>(callback: (userId: string) => Promise<T>): Promise<ALApiResponse<T>> {
    const userId = await getCurrentUserId();
    if (!userId) {
        throw new Error('Unauthorized');
    }

    const data = await callback(userId);
    return {
        success: true,
        data,
    };
}

export async function runAuthenticatedAction<T>(operation: (userId: string) => Promise<T>): Promise<ALApiResponse<T>> {
    try {
        return await withAuthentication(operation);
    } catch (error) {
        console.error(`${CRITICAL_LOG_PREFIX} ${operation.name}`, error);
        return {
            success: false,
            error: getActionErrorMessage(error),
        };
    }
}

export async function runPublicAction<T>(
    operation: () => Promise<T>,
    options?: { logLabel?: string; fallbackError?: string },
): Promise<ALApiResponse<T>> {
    try {
        const data = await operation();
        return { success: true, data };
    } catch (error) {
        console.error(options?.logLabel ?? 'Public action failed', error);
        return {
            success: false,
            error: getActionErrorMessage(error, options?.fallbackError),
        };
    }
}

export function assertValidObjectId(id: string, label = 'ID'): void {
    if (!MongoObjectId.isValid(id)) {
        throw new Error(`${label} is invalid`);
    }
}

export function assertRequiredTrimmedString(value: string | undefined | null, label: string): asserts value is string {
    if (!value?.trim()) {
        throw new Error(`${label} is required`);
    }
}

export function requireUserObjectId(userId: string): MongoObjectId {
    assertValidObjectId(userId, 'User ID');
    return new MongoObjectId(userId);
}

export function toObjectId(id: string, label = 'ID'): MongoObjectId {
    assertValidObjectId(id, label);
    return new MongoObjectId(id);
}
