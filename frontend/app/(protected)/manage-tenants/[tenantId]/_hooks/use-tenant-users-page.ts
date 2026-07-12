'use client';

import { useState } from 'react';
import type { User } from '@aixellabs/backend/db/types';

export type BulkModuleAccessTarget = 'selected' | 'all';

export type UseTenantUsersPageReturn = {
    users: User[];
    editingUser: User | null | undefined;
    setEditingUser: (user: User | null | undefined) => void;
    selectedUserIds: Set<string>;
    toggleUserSelection: (userId: string) => void;
    selectAll: (userIds: string[]) => void;
    clearSelection: () => void;
    bulkModuleAccessOpen: boolean;
    bulkTarget: BulkModuleAccessTarget;
    openBulkModuleAccess: (target: BulkModuleAccessTarget) => void;
    closeBulkModuleAccess: () => void;
};

/**
 * Hook for managing tenant users page state and interactions.
 * editingUser: undefined = dialog closed; User = edit dialog open.
 */
export function useTenantUsersPage(users: User[]): UseTenantUsersPageReturn {
    const [editingUser, setEditingUser] = useState<User | null | undefined>(undefined);
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
    const [bulkModuleAccessOpen, setBulkModuleAccessOpen] = useState(false);
    const [bulkTarget, setBulkTarget] = useState<BulkModuleAccessTarget>('selected');

    const toggleUserSelection = (userId: string) => {
        setSelectedUserIds((prev) => {
            const next = new Set(prev);
            if (next.has(userId)) {
                next.delete(userId);
            } else {
                next.add(userId);
            }
            return next;
        });
    };

    const selectAll = (userIds: string[]) => {
        setSelectedUserIds(new Set(userIds));
    };

    const clearSelection = () => {
        setSelectedUserIds(new Set());
    };

    const openBulkModuleAccess = (target: BulkModuleAccessTarget) => {
        setBulkTarget(target);
        setBulkModuleAccessOpen(true);
    };

    const closeBulkModuleAccess = () => {
        setBulkModuleAccessOpen(false);
    };

    return {
        users,
        editingUser,
        setEditingUser,
        selectedUserIds,
        toggleUserSelection,
        selectAll,
        clearSelection,
        bulkModuleAccessOpen,
        bulkTarget,
        openBulkModuleAccess,
        closeBulkModuleAccess,
    };
}
