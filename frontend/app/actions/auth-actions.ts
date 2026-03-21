'use server';

import { auth, signOut } from '@/auth';
import { ALApiResponse } from '@aixellabs/backend/api/types';

export async function handleSignOut() {
    await signOut({ redirectTo: '/sign-in' });
}

export const isUserAuthenticated = async (): Promise<string | null> => {
    const session = await auth();
    return session?.user?.id ?? null;
};

export const withAuthentication = async <T>(callback: (userId: string) => Promise<T>): Promise<ALApiResponse<T>> => {
    const userId = await isUserAuthenticated();
    if (!userId) {
        return {
            success: false,
            error: 'User not authenticated',
        };
    }
    const data = await callback(userId);
    return {
        success: true,
        data,
    };
};
