import { Tenant } from '@aixellabs/backend/db/types';

export const getTenantMaskedUrl = (tenant: Pick<Tenant, 'name'>): string => {
    const isDev = process.env.NODE_ENV === 'development';
    const name = tenant.name.toLowerCase();

    if (isDev) {
        return `http://${name}.localhost:3003`;
    }

    const defaultRootDomain = 'aixellabs';

    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || defaultRootDomain;
    return `https://${name}.${rootDomain}.com`;
};

/** Absolute URL on a tenant host, e.g. manage-tenants path after switching subdomain. */
export const getTenantHostPathUrl = (tenantName: string, path: string): string => {
    const base = getTenantMaskedUrl({ name: tenantName });
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalized}`;
};
