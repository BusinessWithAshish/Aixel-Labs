'use client';

import { useState } from 'react';
import type { Coupon, ModuleAccess, User } from '@aixellabs/backend/db/types';

export type BulkModuleAccessTarget = 'selected' | 'all';

export type TenantUsersPageData = {
    users: User[];
    coupons: Coupon[];
    sessionTenantName: string;
    tenantSlug: string;
    defaultModuleAccess: ModuleAccess;
    /** Mongo user id of the signed-in admin (for self-demotion warnings). */
    currentUserId: string;
};

export type UseTenantUsersPageReturn = {
    users: User[];
    coupons: Coupon[];
    sessionTenantName: string;
    tenantSlug: string;
    defaultModuleAccess: ModuleAccess;
    currentUserId: string;
    isForeignTenant: boolean;
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
export function useTenantUsersPage(data: TenantUsersPageData): UseTenantUsersPageReturn {
    const { users, coupons, sessionTenantName, tenantSlug, defaultModuleAccess, currentUserId } = data;
    const isForeignTenant = sessionTenantName !== tenantSlug;

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
        coupons,
        sessionTenantName,
        tenantSlug,
        defaultModuleAccess,
        currentUserId,
        isForeignTenant,
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
