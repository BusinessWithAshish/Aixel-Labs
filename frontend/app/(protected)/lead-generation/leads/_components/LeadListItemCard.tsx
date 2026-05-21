'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardAction, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import type { UserLeadList } from '@aixellabs/backend/db/types';
import { Pencil, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import type { TUseUserLeadListsPageReturn } from '../_hooks/use-user-lead-lists-page';

type LeadListItemCardProps = {
    list: UserLeadList;
    selected: boolean;
    onToggleSelect: (id: string, checked: boolean) => void;
};

export function LeadListItemCard({ list, selected, onToggleSelect }: LeadListItemCardProps) {
    const router = useRouter();
    const { openEditDialog } = usePage<TUseUserLeadListsPageReturn>();
    const titleLabel = list.name.trim() || 'Untitled list';

    const listId = list._id ?? '';

    const onClick = useCallback(() => {
        if (!listId) return;
        router.push(`/lead-generation/leads/${listId}`);
    }, [listId, router]);

    return (
        <Card
            onClick={onClick}
            className={cn(
                'gap-2 cursor-pointer hover:shadow-md transition-shadow',
                selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
            )}
        >
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Checkbox
                        checked={selected}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={(v) => onToggleSelect(listId, v === true)}
                        aria-label={`Select ${titleLabel}`}
                    />
                    {list.name}
                </CardTitle>
                <CardAction className="flex items-center gap-1">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 hover:text-primary shrink-0"
                        aria-label={`Edit ${titleLabel}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(list);
                        }}
                    >
                        <Pencil className="size-4" />
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground text-sm">{list.description}</p>
            </CardContent>
            <CardFooter className="flex w-full flex-row flex-wrap items-center justify-between gap-2">
                <div className="text-muted-foreground flex flex-wrap gap-1 text-xs">
                    <Badge variant="secondary" className="wrap-break-word">
                        Updated at:
                        {new Date(list.updatedAt).toLocaleString()}
                    </Badge>
                    <Badge variant="secondary" className="wrap-break-word">
                        Created at:
                        {new Date(list.createdAt).toLocaleString()}
                    </Badge>
                </div>
                <Badge variant="secondary" className="w-fit shrink-0 gap-1.5 font-medium tabular-nums">
                    <Users className="size-3.5 opacity-80" aria-hidden />
                    {list.leadCount} leads
                </Badge>
            </CardFooter>
        </Card>
    );
}
