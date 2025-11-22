'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pencil, User as UserIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { User } from '@/helpers/user-operations';

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
                'relative flex items-center gap-4 p-4 transition-all hover:shadow-md',
                className,
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 flex-shrink-0">
                <UserIcon className="w-6 h-6 text-primary" />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-semibold truncate">{user.name || 'No Name'}</h3>
                    {user.isAdmin && (
                        <Badge variant="secondary" className="text-xs">
                            Admin
                        </Badge>
                    )}
                </div>
                <p className="text-sm text-muted-foreground truncate">{user.email}</p>
            </div>

            {onEdit && (
                <div className={cn('flex-shrink-0', 'max-md:flex', !isHovered && 'md:hidden')}>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shadow-sm hover:bg-secondary cursor-pointer"
                        onClick={handleEditClick}
                    >
                        <Pencil className="h-4 w-4" />
                    </Button>
                </div>
            )}
        </Card>
    );
}
