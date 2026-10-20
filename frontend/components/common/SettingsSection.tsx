import type { ComponentProps, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type SettingsSectionProps = Omit<ComponentProps<'section'>, 'title'> & {
    /** The heading's id; the section is labelled by it. */
    titleId?: string;
    icon?: LucideIcon;
    title: ReactNode;
    description?: ReactNode;
    /** At the right of the heading: a switch, an add button. */
    action?: ReactNode;
};

/** One titled part of a settings card: icon + title, a line on what it does, an optional action, then its content. */
export function SettingsSection({
    titleId,
    icon: Icon,
    title,
    description,
    action,
    children,
    className,
    ...props
}: SettingsSectionProps) {
    return (
        <section aria-labelledby={titleId} className={cn('grid gap-3', className)} {...props}>
            <header className="flex items-start justify-between gap-4">
                <div className="grid gap-1">
                    <h3 id={titleId} className="flex flex-wrap items-center gap-2 font-medium">
                        {Icon ? <Icon className="text-muted-foreground size-4" /> : null}
                        {title}
                    </h3>
                    {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
                </div>
                {action}
            </header>
            {children}
        </section>
    );
}
