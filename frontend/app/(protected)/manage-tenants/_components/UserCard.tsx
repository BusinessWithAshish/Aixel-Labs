'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pencil, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { User } from '@/helpers/user-operations';
import { UserRoleBadge } from '@/components/common/UserRoleBadge';

type UserCardProps = {
    user: User;
    onEdit?: () => void;
    className?: string;
};

export function UserCard({ user, onEdit, className }: UserCardProps) {
    const [isHovered, setIsHovered] = useState(false);

    const handleEditClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onEdit?.();
    };

    return (
        <Card
            className={cn(
                'relative flex items-start gap-4 p-4 transition-all hover:shadow-md max-w-sm',
                className,
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Pencil icon - top right */}
            {onEdit && (
                <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                        'absolute top-2 right-2 h-8 w-8 shadow-sm hover:bg-secondary cursor-pointer z-10',
                        'max-md:flex',
                        !isHovered && 'md:hidden'
                    )}
                    onClick={handleEditClick}
                >
                    <Pencil className="h-4 w-4" />
                </Button>
            )}

            {/* Admin badge - bottom right */}
            <div className="absolute bottom-2 right-2 z-10">
                <UserRoleBadge isAdmin={user.isAdmin} />
            </div>

            {/* User icon - left */}
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 flex-shrink-0">
                <UserIcon className="w-6 h-6 text-primary" />
            </div>

            {/* Content - left aligned */}
            <div className="flex-1 min-w-0 pr-16">
                <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-semibold truncate">{user.name || 'No Name'}</h3>
                </div>
                <p className="text-sm text-muted-foreground truncate">{user.email}</p>
            </div>
        </Card>
    );
}
