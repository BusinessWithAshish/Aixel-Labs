'use client';

import { UserCard } from '../../_components/UserCard';
import { EditUserDialog } from '../../_components/EditUserDialog';
import { CommonLoader } from '@/components/common/CommonLoader';
import { usePage } from '@/contexts/PageStore';
import type { UseTenantUsersPageReturn } from '../_hooks';

export function TenantUsersContent() {
    const { users, isLoading, error, editingUser, setEditingUser, refreshUsers } =
        usePage<UseTenantUsersPageReturn>();

    const handleEditUser = (user: (typeof users)[0]) => {
        setEditingUser(user);
    };

    const handleDialogClose = () => {
        setEditingUser(null);
    };

    if (isLoading) {
        return <CommonLoader size="lg" text="Loading users..." />;
    }

    if (error) {
        return (
            <div className="flex items-center justify-center p-6">
                <p className="text-destructive">{error}</p>
            </div>
        );
    }

    if (users.length === 0) {
        return (
            <div className="flex items-center justify-center p-6">
                <p className="text-muted-foreground">No users found for this tenant.</p>
            </div>
        );
    }

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
                {users.map((user) => (
                    <UserCard key={user._id} user={user} onEdit={() => handleEditUser(user)} />
                ))}
            </div>

            <EditUserDialog
                open={!!editingUser}
                onOpenChange={handleDialogClose}
                user={editingUser}
                onSuccess={refreshUsers}
            />
        </>
    );
}
