'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTenantMaskedUrl } from '@/helpers/get-tenant-masked-url';
import type { Tenant } from '@aixellabs/backend/db/types';
import { AppLogo } from "@/components/common/AppLogo";

type TenantCardProps = {
    tenant: Tenant;
    onClick?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    className?: string;
};

export function TenantCard({ tenant, onClick, onEdit, onDelete, className }: TenantCardProps) {
    const isDeployedTenant = !!tenant.redirect_url;
    const tenantUrl = getTenantMaskedUrl(tenant);

    const handleEditClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onEdit?.();
    };

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onDelete?.();
    };

    const tenantName = tenant.label || tenant.name || 'Unnamed Tenant';

    return (
        <Card
            className={cn(
                'relative group flex flex-col items-center justify-center p-6 cursor-pointer transition-all hover:shadow-lg hover:scale-105',
                isDeployedTenant && 'cursor-not-allowed bg-muted',
                className,
            )}
            onClick={onClick}
        >
            <div className={cn('absolute top-2 right-2 flex gap-1', 'max-md:flex', 'group-hover:block hidden')}>
                {onEdit && (
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shadow-sm hover:bg-secondary hover:text-primary cursor-pointer"
                        onClick={handleEditClick}
                    >
                        <Pencil className="h-4 w-4" />
                    </Button>
                )}
                {onDelete && (
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shadow-sm hover:bg-secondary hover:text-red-500 cursor-pointer"
                        onClick={handleDeleteClick}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
            </div>

            <AppLogo title={tenantName} src={tenant.app_logo_url} className="w-8 h-8 text-primary mb-3" />

            <h1 className="text-2xl font-semibold text-center">{tenantName}</h1>
            {tenant.app_description && (
                <h3 className="text-sm text-muted-foreground text-center mt-1 break-all px-2">{tenant.app_description}</h3>
            )}
            <p className="text-sm text-muted-foreground text-center mt-1 break-all px-2">{tenantUrl}</p>
        </Card>
    );
}
