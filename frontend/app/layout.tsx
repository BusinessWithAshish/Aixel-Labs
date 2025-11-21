import type { Metadata } from 'next';
import '@/app/globals.css';
import { getCurrentTenantData, getCurrentTenantFromHeaders, validateTenant } from '@/helpers/validate-tenant';
import NotFound from '@/components/layout/not-found';
import { LovableEmbed } from '@/components/layout/custom-demo-layout';
import { RootLayoutUI } from '@/components/common/RootLayout';
import { auth } from '@/auth';
import SigninLayout from '@/components/common/SigninLayout';

export const metadata: Metadata = {
    title: process.env.NEXT_PUBLIC_APP_NAME || 'AixelLabs',
    description: 'Agentic Lead management system',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    const currentTenant = await getCurrentTenantFromHeaders();
    if (!currentTenant) {
        return <NotFound />;
    }

    const isTenantValid = await validateTenant(currentTenant);
    if (!isTenantValid) {
        return <NotFound />;
    }

    const hasRedirectUrl = await getCurrentTenantData(currentTenant);
    const redirectUrl = hasRedirectUrl?.redirect_url;
    if (redirectUrl) {
        return <LovableEmbed src={redirectUrl as string} />;
    }

    const session = await auth();

    return session?.user ? <RootLayoutUI>{children}</RootLayoutUI> : <SigninLayout />;
}
