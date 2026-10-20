import type { ComponentProps, ReactNode } from 'react';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { cn } from '@/lib/utils';

type EmptyStateProps = Omit<ComponentProps<typeof Empty>, 'title'> & {
    icon: ReactNode;
    title: ReactNode;
    description: ReactNode;
    /** What to do next (buttons, links), under the text. */
    children?: ReactNode;
    classNames?: { content?: string };
};

/** A bordered "nothing here yet" panel: icon, title, description and optional actions. */
export function EmptyState({ icon, title, description, children, className, classNames, ...props }: EmptyStateProps) {
    return (
        <Empty className={cn('border', className)} {...props}>
            <EmptyHeader>
                <EmptyMedia variant="icon">{icon}</EmptyMedia>
                <EmptyTitle>{title}</EmptyTitle>
                <EmptyDescription>{description}</EmptyDescription>
            </EmptyHeader>
            {children ? <EmptyContent className={classNames?.content}>{children}</EmptyContent> : null}
        </Empty>
    );
}
