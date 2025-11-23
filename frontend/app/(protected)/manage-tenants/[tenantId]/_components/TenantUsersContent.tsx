'use client';

import { UserCard } from '../../_components/UserCard';
import { EditUserDialog } from '../../_components/EditUserDialog';
import { usePage } from '@/contexts/PageStore';
import type { UseTenantUsersPageReturn } from '../_hooks';
import { NoDataFound } from '@/components/common/NoDataFound';

export function TenantUsersContent() {
    const { users, editingUser, setEditingUser } = usePage<UseTenantUsersPageReturn>();
    const handleEditUser = (user: (typeof users)[0]) => {
        setEditingUser(user);
    };

    const handleDialogClose = () => {
        setEditingUser(null);
    };

    if (users.length === 0) {
        return <NoDataFound />;
    }

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
                {users.map((user) => (
                    <UserCard key={user._id} user={user} onEdit={() => handleEditUser(user)} />
                ))}
            </div>

            <EditUserDialog open={!!editingUser} onOpenChange={handleDialogClose} user={editingUser} onSuccess={() => {}} />
        </>
    );
}
