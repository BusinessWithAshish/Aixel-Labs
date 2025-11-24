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
                'relative flex items-start gap-2 sm:gap-4 p-3 sm:p-4 transition-all hover:shadow-md w-full overflow-hidden',
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
                        'absolute top-1.5 right-1.5 sm:top-2 sm:right-2 h-7 w-7 sm:h-8 sm:w-8 shadow-sm hover:bg-secondary cursor-pointer z-10',
                        'max-md:flex',
                        !isHovered && 'md:hidden',
                    )}
                    onClick={handleEditClick}
                >
                    <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
            )}

            {/* Admin badge - bottom right */}
            <div className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 z-10">
                <UserRoleBadge isAdmin={user.isAdmin} />
            </div>

            {/* User icon - left */}
            <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex-shrink-0">
                <UserIcon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            </div>

            {/* Content - left aligned */}
            <div className="flex-1 min-w-0 pr-12 sm:pr-16 md:pr-20 overflow-hidden">
                <div className="flex items-center gap-2 mb-1 min-w-0">
                    <h3 className="text-sm sm:text-base font-semibold truncate" title={user.name || 'No Name'}>
                        {user.name || 'No Name'}
                    </h3>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground truncate" title={user.email}>
                    {user.email}
                </p>
            </div>
        </Card>
    );
}
