'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { UserCard } from './UserCard';
import { UserDialog } from './EditUserDialog';
import { DeleteUserConfirmDialog } from './DeleteUserConfirmDialog';
import { UserBulkActionsToolbar } from './UserBulkActionsToolbar';
import { BulkModuleAccessDialog } from './BulkModuleAccessDialog';
import { SwitchTenantConfirmDialog } from '../../_components/SwitchTenantConfirmDialog';
import { usePage } from '@/contexts/PageStore';
import type { UseTenantUsersPageReturn } from '../_hooks/use-tenant-users-page';
import type { User } from '@aixellabs/backend/db/types';
import { deleteUser } from '@/app/actions/user-actions';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { MANAGE_TENANTS_PREFIX } from '@/config/app-config';
import { getTenantHostPathUrl } from '@/helpers/get-tenant-masked-url';

export function TenantUsersContent() {
    const router = useRouter();
    const params = useParams();
    const tenantId = params?.tenantId as string;
    const {
        users,
        defaultModuleAccess,
        currentUserId,
        isForeignTenant,
        tenantSlug,
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
    } = usePage<UseTenantUsersPageReturn>();
    const [searchQuery, setSearchQuery] = useState('');
    const [showAdminsOnly, setShowAdminsOnly] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<User | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [switchDialogOpen, setSwitchDialogOpen] = useState(false);

    useEffect(() => {
        if (isForeignTenant) {
            setSwitchDialogOpen(true);
        }
    }, [isForeignTenant]);

    const nonAdminUsers = useMemo(() => users.filter((user) => !user.isAdmin), [users]);

    const filteredUsers = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();
        return users.filter((user) => {
            const matchesSearch =
                !normalizedQuery ||
                user.email.toLowerCase().includes(normalizedQuery) ||
                user.name?.toLowerCase().includes(normalizedQuery) ||
                user.phoneNumber?.toLowerCase().includes(normalizedQuery);
            const matchesAdminFilter = !showAdminsOnly || user.isAdmin;
            return matchesSearch && matchesAdminFilter;
        });
    }, [searchQuery, showAdminsOnly, users]);

    const selectableFilteredIds = useMemo(
        () =>
            filteredUsers
                .filter((user) => !user.isAdmin)
                .map((user) => user._id as string)
                .filter(Boolean),
        [filteredUsers],
    );

    const selectedUserIdList = useMemo(() => Array.from(selectedUserIds), [selectedUserIds]);

    const handleEditUser = (user: (typeof users)[0]) => {
        setEditingUser(user);
    };

    const handleDialogClose = () => {
        setEditingUser(undefined);
    };

    const handleSuccess = () => {
        router.refresh();
    };

    const handleBulkSuccess = () => {
        clearSelection();
        router.refresh();
    };

    const handleDeleteClick = (user: (typeof users)[0]) => {
        setUserToDelete(user);
        setDeleteDialogOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!userToDelete) return;

        setIsDeleting(true);
        const result = await deleteUser(userToDelete._id as string);

        if (result.success) {
            toast.success('User deleted successfully');
            setDeleteDialogOpen(false);
            setUserToDelete(null);
            router.refresh();
        } else {
            toast.error(result.error || 'Failed to delete user');
        }
        setIsDeleting(false);
    };

    const isDialogOpen = editingUser !== undefined && editingUser !== null;

    if (isForeignTenant) {
        return (
            <SwitchTenantConfirmDialog
                open={switchDialogOpen}
                onOpenChange={(open) => {
                    setSwitchDialogOpen(open);
                    if (!open) {
                        router.push('/manage-tenants');
                    }
                }}
                targetTenantName={tenantSlug}
                targetUrl={getTenantHostPathUrl(tenantSlug, `${MANAGE_TENANTS_PREFIX}${tenantSlug}`)}
                description={`You are signed into a different tenant. Switch to ${tenantSlug} to manage its users.`}
            />
        );
    }

    return (
        <>
            <div className="flex flex-col gap-4 p-4 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
                    <div className="w-full sm:max-w-md sm:flex-1">
                        <Input
                            placeholder="Search users..."
                            className="w-full"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:justify-end">
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="admins-only"
                                checked={showAdminsOnly}
                                onCheckedChange={(checked) => setShowAdminsOnly(checked === true)}
                                className="shrink-0"
                            />
                            <Label
                                htmlFor="admins-only"
                                className="text-sm text-muted-foreground whitespace-nowrap cursor-pointer"
                            >
                                Admins only
                            </Label>
                        </div>
                        <UserBulkActionsToolbar
                            selectedCount={selectedUserIds.size}
                            filteredCount={selectableFilteredIds.length}
                            totalCount={nonAdminUsers.length}
                            onSelectAll={() => selectAll(selectableFilteredIds)}
                            onDeselectAll={clearSelection}
                            onEditSelectedModuleAccess={() => openBulkModuleAccess('selected')}
                            onApplyToAllUsers={() => openBulkModuleAccess('all')}
                        />
                    </div>
                </div>

                <p className="text-muted-foreground text-sm">
                    Users join by signing in with Google and verifying a phone number. Edit permissions below. Bulk
                    module updates skip admins.
                </p>

                <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredUsers.map((user) => {
                        const userId = user._id as string;
                        return (
                            <UserCard
                                key={userId}
                                user={user}
                                selected={selectedUserIds.has(userId)}
                                onSelectedChange={
                                    user.isAdmin
                                        ? undefined
                                        : (selected) => {
                                              const isSelected = selectedUserIds.has(userId);
                                              if (selected !== isSelected) {
                                                  toggleUserSelection(userId);
                                              }
                                          }
                                }
                                onEdit={() => handleEditUser(user)}
                                onDelete={() => handleDeleteClick(user)}
                            />
                        );
                    })}
                </div>

                {filteredUsers.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                        No users found{searchQuery.trim() ? ` for "${searchQuery.trim()}"` : ''}.
                    </p>
                )}
            </div>

            <UserDialog
                open={isDialogOpen}
                onOpenChange={(open) => {
                    if (!open) handleDialogClose();
                }}
                user={editingUser ?? null}
                tenantId={tenantId}
                defaultModuleAccess={defaultModuleAccess}
                currentUserId={currentUserId}
                onSuccess={handleSuccess}
            />

            <BulkModuleAccessDialog
                open={bulkModuleAccessOpen}
                onOpenChange={(open) => {
                    if (!open) closeBulkModuleAccess();
                }}
                tenantName={tenantId}
                target={bulkTarget}
                selectedUserIds={selectedUserIdList}
                totalUserCount={nonAdminUsers.length}
                onSuccess={handleBulkSuccess}
            />

            <DeleteUserConfirmDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
                userEmail={userToDelete?.email || ''}
                onConfirm={handleConfirmDelete}
                isDeleting={isDeleting}
            />
        </>
    );
}
