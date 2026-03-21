import { ExternalEmbed } from '@/components/layout/custom-demo-layout';
import { validateAndGetTenant } from '@/helpers/validate-tenant';
import { notFound } from 'next/navigation';

export default async function IframeTenantPage() {
    const tenant = await validateAndGetTenant();

    if (!tenant?.redirect_url) {
        notFound();
    }

    return <ExternalEmbed src={tenant.redirect_url} />;
}
