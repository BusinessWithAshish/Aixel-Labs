'use client';

import { useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { UserCard } from './UserCard';
import { AddUserCard } from './AddUserCard';
import { UserDialog } from './EditUserDialog';
import { usePage } from '@/contexts/PageStore';
import type { UseTenantUsersPageReturn } from '../_hooks';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export function TenantUsersContent() {
    const router = useRouter();
    const params = useParams();
    const tenantId = params?.tenantId as string;
    const { users, editingUser, setEditingUser } = usePage<UseTenantUsersPageReturn>();
    const [searchQuery, setSearchQuery] = useState('');
    const [showAdminsOnly, setShowAdminsOnly] = useState(false);

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

    const isDialogOpen = editingUser !== undefined;

    return (
        <>
            <div className="flex flex-col gap-4 p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="max-w-md">
                        <Input
                            placeholder="Search users by name or email"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="admins-only"
                            checked={showAdminsOnly}
                            onCheckedChange={(checked) => setShowAdminsOnly(checked === true)}
                        />
                        <Label htmlFor="admins-only" className="text-sm text-muted-foreground">
                            Admins only
                        </Label>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredUsers.map((user) => (
                        <UserCard key={user._id} user={user} onEdit={() => handleEditUser(user)} />
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
        </>
    );
}
