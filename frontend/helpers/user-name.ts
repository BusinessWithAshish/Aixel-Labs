import { z } from 'zod';

export const USER_NAME_MAX_LENGTH = 100;

/** Letters and numbers, with at most one internal space (e.g. "Ashish" or "Ashish Kumar"). */
const USER_NAME_PATTERN = /^[A-Za-z0-9]+(?: [A-Za-z0-9]+)?$/;

export const userNameSchema = z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(USER_NAME_MAX_LENGTH, `Name must be at most ${USER_NAME_MAX_LENGTH} characters`)
    .regex(USER_NAME_PATTERN, 'Use letters and numbers only, with at most one space');

export function parseUserName(name: string): string {
    const result = userNameSchema.safeParse(name);
    if (!result.success) {
        throw new Error(result.error.issues[0]?.message ?? 'Invalid name');
    }
    return result.data;
}
