'use server';

import { createUser, updateUser, type CreateUserInput, type UpdateUserInput } from '@/helpers/user-operations';

export type CreateUserResult = {
    success: boolean;
    error?: string;
    data?: unknown;
};

export type UpdateUserResult = {
    success: boolean;
    error?: string;
    data?: unknown;
};

export async function createUserAction(input: CreateUserInput): Promise<CreateUserResult> {
    try {
        if (!input.email || !input.password || !input.tenantId) {
            return {
                success: false,
                error: 'Email, password, and tenant ID are required',
            };
        }

        const newUser = await createUser(input);

        if (!newUser) {
            return {
                success: false,
                error: 'User already exists or creation failed',
            };
        }

        return {
            success: true,
            data: newUser,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create user';
        return {
            success: false,
            error: errorMessage,
        };
    }
}

export async function updateUserAction(id: string, input: UpdateUserInput): Promise<UpdateUserResult> {
    try {
        if (!id) {
            return {
                success: false,
                error: 'User ID is required',
            };
        }

        const updatedUser = await updateUser(id, input);

        if (!updatedUser) {
            return {
                success: false,
                error: 'User not found or update failed',
            };
        }

        return {
            success: true,
            data: updatedUser,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to update user';
        return {
            success: false,
            error: errorMessage,
        };
    }
}
