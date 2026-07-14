import type { ReactNode } from 'react';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { CreditCostNotice } from '@/components/common/credits/CreditCostNotice';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export type LeadFormWrapperProps = {
    config: {
        title: ReactNode;
        description?: ReactNode;
        icon: {
            src: string;
            alt: string;
            size?: number;
            fallback?: ReactNode;
        };
    };
    creditModule?: LEAD_GENERATION_SUB_MODULES;
    actions?: ReactNode;
    children: ReactNode;
    classNames?: {
        card?: string;
        header?: string;
        title?: string;
        titleText?: string;
        icon?: string;
        iconImage?: string;
        iconFallback?: string;
        description?: string;
        action?: string;
        content?: string;
        creditNotice?: string;
    };
};

export function LeadFormWrapper({
    config,
    creditModule,
    actions,
    children,
    classNames,
}: LeadFormWrapperProps) {
    const iconSize = config.icon.size ?? 20;

    return (
        <Card className={classNames?.card}>
            <CardHeader className={classNames?.header}>
                <CardTitle className={cn('flex items-center gap-2', classNames?.title)}>
                    <Avatar className={cn('shrink-0', classNames?.icon)} style={{ width: iconSize, height: iconSize }}>
                        <AvatarImage className={classNames?.iconImage} src={config.icon.src} alt={config.icon.alt} />
                        <AvatarFallback className={classNames?.iconFallback}>
                            {config.icon.fallback ?? config.icon.alt?.[0] ?? '?'}
                        </AvatarFallback>
                    </Avatar>
                    <span className={classNames?.titleText}>{config.title}</span>
                </CardTitle>
                {config.description ? (
                    <CardDescription className={classNames?.description}>{config.description}</CardDescription>
                ) : null}
                {creditModule ? (
                    <CreditCostNotice module={creditModule} className={classNames?.creditNotice} />
                ) : null}
                {actions ? (
                    <CardAction className={cn('flex item-center flex-row w-full gap-2', classNames?.action)}>
                        {actions}
                    </CardAction>
                ) : null}
            </CardHeader>
            <CardContent className={classNames?.content}>{children}</CardContent>
        </Card>
    );
}

