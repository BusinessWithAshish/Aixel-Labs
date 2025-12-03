import type { Tenant } from '@aixellabs/shared/mongodb';

export const getTenantRedirectUrl = (tenant: Tenant): string => {
    if (tenant.redirect_url) return tenant.redirect_url;

    const isDev = process.env.NODE_ENV === 'development';
    const name = tenant.name.toLowerCase();

    if (isDev) {
        return `http://${name}.localhost:3003`;
    }

    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'aixellabs';
    return `https://${name}.${rootDomain}.com`;
};
