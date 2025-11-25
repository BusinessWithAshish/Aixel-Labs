'use client';

import { useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { UserCard } from './UserCard';
import { AddUserCard } from './AddUserCard';
import { UserDialog } from './EditUserDialog';
import { DeleteUserConfirmDialog } from './DeleteUserConfirmDialog';
import { usePage } from '@/contexts/PageStore';
import type { UseTenantUsersPageReturn } from '../_hooks';
import type { User } from '@/helpers/user-operations';
import { deleteUserAction } from '@/app/actions/user-actions';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export function TenantUsersContent() {
    const router = useRouter();
    const params = useParams();
    const tenantId = params?.tenantId as string;
    const { users, editingUser, setEditingUser } = usePage<UseTenantUsersPageReturn>();
    const [searchQuery, setSearchQuery] = useState('');
    const [showAdminsOnly, setShowAdminsOnly] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<User | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const filteredUsers = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();
        return users.filter((user) => {
            const matchesSearch =
                !normalizedQuery ||
                user.email.toLowerCase().includes(normalizedQuery) ||
                user.name?.toLowerCase().includes(normalizedQuery);
            const matchesAdminFilter = !showAdminsOnly || user.isAdmin;
            return matchesSearch && matchesAdminFilter;
        });
    }, [searchQuery, showAdminsOnly, users]);

    const handleEditUser = (user: (typeof users)[0]) => {
        setEditingUser(user);
    };

    const handleAddUser = () => {
        setEditingUser(null);
    };

    const handleDialogClose = () => {
        setEditingUser(undefined);
    };

    const handleSuccess = () => {
        router.refresh();
    };

    const handleDeleteClick = (user: (typeof users)[0]) => {
        setUserToDelete(user);
        setDeleteDialogOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!userToDelete) return;

        setIsDeleting(true);
        const result = await deleteUserAction(userToDelete._id);

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

    const isDialogOpen = editingUser !== undefined;

    return (
        <>
            <div className="flex flex-col gap-4 p-4 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="w-full sm:max-w-md sm:flex-1">
                        <Input
                            placeholder="Search users..."
                            className="w-full"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 sm:shrink-0">
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
                </div>

                <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredUsers.map((user) => (
                        <UserCard
                            key={user._id}
                            user={user}
                            onEdit={() => handleEditUser(user)}
                            onDelete={() => handleDeleteClick(user)}
                        />
                    ))}
                    <AddUserCard onClick={handleAddUser} />
                </div>

                {filteredUsers.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                        No users found{searchQuery.trim() ? ` for "${searchQuery.trim()}"` : ''}.
                    </p>
                )}
            </div>

            <UserDialog
                open={isDialogOpen}
                onOpenChange={handleDialogClose}
                user={editingUser ?? null}
                tenantId={tenantId}
                onSuccess={handleSuccess}
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
