import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type UserRoleBadgeProps = {
    isAdmin: boolean;
    className?: string;
};

export function UserRoleBadge({ isAdmin, className }: UserRoleBadgeProps) {
    return (
        <Badge
            variant={isAdmin ? 'default' : 'secondary'}
            className={cn('text-[10px] px-1.5 py-0', className)}
        >
            {isAdmin ? 'ADMIN' : 'USER'}
        </Badge>
    );
}

