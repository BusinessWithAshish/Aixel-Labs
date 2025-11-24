'use client';

import { useState } from 'react';
import type { User } from '@/helpers/user-operations';

export type UseTenantUsersPageReturn = {
    users: User[];
    editingUser: User | null | undefined;
    setEditingUser: (user: User | null | undefined) => void;
};

/**
 * Hook for managing tenant users page state and interactions
 * Accepts tenantId from server as initial data
 * editingUser can be:
 * - null: Add mode (dialog open, no user selected)
 * - undefined: Dialog closed
 * - User: Edit mode (dialog open, user selected)
 */
export function useTenantUsersPage(users: User[]): UseTenantUsersPageReturn {
    const [editingUser, setEditingUser] = useState<User | null | undefined>(undefined);

    return {
        users,
        editingUser,
        setEditingUser,
    };
}
