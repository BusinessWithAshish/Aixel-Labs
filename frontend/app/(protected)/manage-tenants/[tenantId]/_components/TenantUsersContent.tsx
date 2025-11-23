'use client';

import { useRouter, useParams } from 'next/navigation';
import { UserCard } from './UserCard';
import { AddUserCard } from './AddUserCard';
import { UserDialog } from './EditUserDialog';
import { usePage } from '@/contexts/PageStore';
import type { UseTenantUsersPageReturn } from '../_hooks';
import { NoDataFound } from '@/components/common/NoDataFound';

export function TenantUsersContent() {
    const router = useRouter();
    const params = useParams();
    const tenantId = params?.tenantId as string;
    const { users, editingUser, setEditingUser } = usePage<UseTenantUsersPageReturn>();

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

    const isDialogOpen = editingUser !== undefined;

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
                {users.map((user) => (
                    <UserCard key={user._id} user={user} onEdit={() => handleEditUser(user)} />
                ))}
                <AddUserCard onClick={handleAddUser} />
            </div>

            <UserDialog
                open={isDialogOpen}
                onOpenChange={handleDialogClose}
                user={editingUser ?? null}
                tenantId={tenantId}
                onSuccess={handleSuccess}
            />
        </>
    );
}
