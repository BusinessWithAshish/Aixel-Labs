'use client';

import { useState } from 'react';
import {
    BadgeCheck,
    // Bell,
    ChevronsUpDown,
    // CreditCard,
    LogOut,
} from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItems,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { SidebarUser } from '@/config/sidebar.config';
import { handleSignOut } from '@/app/actions/auth-actions';
import { UserRoleBadge } from '@/components/common/UserRoleBadge';
import { SIGN_IN_PATH } from '@/lib/auth/constants';
import { useRouter } from 'next/navigation';

export function NavUser({ user }: { user: SidebarUser }) {
    const { isMobile } = useSidebar();
    const router = useRouter();
    const [showLogoutDialog, setShowLogoutDialog] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const handleLogoutClick = () => {
        setShowLogoutDialog(true);
    };

    const confirmLogout = async () => {
        setIsLoggingOut(true);
        try {
            await handleSignOut();
            // Full reload keeps the current tenant host so sign-in branding resolves correctly.
            window.location.assign(SIGN_IN_PATH);
        } catch (error) {
            console.error('Logout error:', error);
            setShowLogoutDialog(false);
            setIsLoggingOut(false);
        }
    };

    return (
        <>
            <SidebarMenu>
                <SidebarMenuItem>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <SidebarMenuButton
                                size="lg"
                                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                            >
                                <Avatar className="h-8 w-8 rounded-lg">
                                    <AvatarImage src={user.avatar} alt={user.name} />
                                    <AvatarFallback className="rounded-lg">
                                        {user.name.charAt(0) + user.name.charAt(user.name.length - 1)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-medium">{user.name}</span>
                                    <span className="truncate text-xs">{user.email}</span>
                                </div>
                                <ChevronsUpDown className="ml-auto size-4" />
                            </SidebarMenuButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                            side={isMobile ? 'bottom' : 'right'}
                            align="end"
                            sideOffset={4}
                        >
                            <DropdownMenuLabel className="p-0 font-normal">
                                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                                    <Avatar className="h-8 w-8 rounded-lg">
                                        <AvatarImage src={user.avatar} alt={user.name} />
                                        <AvatarFallback className="rounded-lg">
                                            {user.name.charAt(0) + user.name.charAt(user.name.length - 1)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="grid flex-1 text-left text-sm leading-tight">
                                        <div className="flex items-center gap-2">
                                            <span className="truncate font-medium">{user.name}</span>
                                            <UserRoleBadge isAdmin={user.isAdmin} />
                                        </div>
                                        <span className="truncate text-xs">{user.email}</span>
                                    </div>
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItems
                                options={[
                                    {
                                        key: 'account',
                                        label: 'Account',
                                        icon: BadgeCheck,
                                        onSelect: () => router.push('/account-settings'),
                                    },
                                ]}
                            />
                            <DropdownMenuSeparator />
                            <DropdownMenuItems
                                options={[
                                    {
                                        key: 'logout',
                                        label: 'Log out',
                                        icon: LogOut,
                                        onSelect: handleLogoutClick,
                                    },
                                ]}
                            />
                        </DropdownMenuContent>
                    </DropdownMenu>
                </SidebarMenuItem>
            </SidebarMenu>

            <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm Logout</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to log out? You&#39;ll need to sign in again to access your account.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowLogoutDialog(false)} disabled={isLoggingOut}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={confirmLogout} disabled={isLoggingOut}>
                            {isLoggingOut ? 'Logging out...' : 'Log out'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
