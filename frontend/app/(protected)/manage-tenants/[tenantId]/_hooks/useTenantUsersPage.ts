'use client';

import { useState, useEffect, useCallback } from 'react';
import type { User } from '@/helpers/user-operations';

export type UseTenantUsersPageReturn = {
    users: User[];
    isLoading: boolean;
    error: string | null;
    editingUser: User | null;
    setEditingUser: (user: User | null) => void;
    refreshUsers: () => Promise<void>;
};

export function useTenantUsersPage(tenantId: string): UseTenantUsersPageReturn {
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingUser, setEditingUser] = useState<User | null>(null);

    const fetchUsers = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/users?tenantId=${tenantId}`);
            const data = await response.json();

            if (data.success) {
                setUsers(data.data || []);
            } else {
                setError(data.error || 'Failed to fetch users');
            }
        } catch (err) {
            setError('An error occurred while fetching users');
            console.error('Fetch users error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [tenantId]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const refreshUsers = useCallback(async () => {
        await fetchUsers();
    }, [fetchUsers]);

    return {
        users,
        isLoading,
        error,
        editingUser,
        setEditingUser,
        refreshUsers,
    };
}
