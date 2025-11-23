'use client';

import { useState } from 'react';
import type { User } from '@/helpers/user-operations';

export type UseTenantUsersPageReturn = {
    users: User[];
    editingUser: User | null;
    setEditingUser: (user: User | null) => void;
};

/**
 * Hook for managing tenant users page state and interactions
 * Accepts tenantId from server as initial data
 */
export function useTenantUsersPage(users: User[]): UseTenantUsersPageReturn {
    const [editingUser, setEditingUser] = useState<User | null>(null);

    return {
        users,
        editingUser,
        setEditingUser,
    };
}
