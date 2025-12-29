import type { Metadata } from 'next';
import '@/app/globals.css';
import { validateAndGetTenant } from '@/helpers/validate-tenant';
import { ExternalEmbed } from '@/components/layout/custom-demo-layout';
import { RootLayoutUI } from '@/components/common/RootLayout';
import { notFound } from 'next/navigation';

export const metadata: Metadata = {
    title: process.env.NEXT_PUBLIC_APP_NAME || 'AixelLabs',
    description: 'Agentic Lead management system',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    const currentTenantData = await validateAndGetTenant();

    if (!currentTenantData) {
        return notFound();
    }

    const redirectUrl = currentTenantData?.redirect_url as string | undefined;

    if (redirectUrl) {
        return <ExternalEmbed src={redirectUrl} />;
    }

    return <RootLayoutUI>{children}</RootLayoutUI>;
}
