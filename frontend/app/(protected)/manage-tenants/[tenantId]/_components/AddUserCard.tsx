'use client';

import { Card } from '@/components/ui/card';
import { UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

type AddUserCardProps = {
    onClick: () => void;
    className?: string;
};

export function AddUserCard({ onClick, className }: AddUserCardProps) {
    return (
        <Card
            className={cn(
                'flex flex-col items-center justify-center p-6 cursor-pointer transition-all hover:shadow-lg hover:scale-105 border-dashed border-2 bg-muted/20 max-w-sm',
                className,
            )}
            onClick={onClick}
        >
            <div className="flex items-center justify-center w-16 h-16 rounded-lg bg-muted mb-4">
                <UserPlus className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-center text-muted-foreground">Add User</h3>
        </Card>
    );
}

