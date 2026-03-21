import { Tenant } from '@aixellabs/backend/db/types';

export const getTenantMaskedUrl = (tenant: Tenant): string => {
    const isDev = process.env.NODE_ENV === 'development';
    const name = tenant.name.toLowerCase();

    if (isDev) {
        return `http://${name}.localhost:3003`;
    }

    const defaultRootDomain = 'aixellabs';

    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || defaultRootDomain;
    return `https://${name}.${rootDomain}.com`;
};
