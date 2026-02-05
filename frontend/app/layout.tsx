import type { Metadata } from 'next';
import '@/app/globals.css';
import { RootLayoutUI } from '@/components/common/RootLayout';
import { ExternalEmbed } from '@/components/layout/custom-demo-layout';
import { validateAndGetTenant } from '@/helpers/validate-tenant';
import { APP_DESCRIPTION, APP_NAME } from "@/config/app-config";

export async function generateMetadata(): Promise<Metadata> {
    const currentTenantData = await validateAndGetTenant();

    return {
        title: currentTenantData?.label || process.env.NEXT_PUBLIC_APP_NAME || APP_NAME,
        description: currentTenantData?.app_description || APP_DESCRIPTION,
    };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    const currentTenantData = await validateAndGetTenant();
    const redirectUrl = currentTenantData?.redirect_url;

    if (redirectUrl) {
        return <ExternalEmbed src={redirectUrl} />;
    }

    return (
        <RootLayoutUI
            tenantAppLogoUrl={currentTenantData?.app_logo_url}
            tenantAppThemeColor={currentTenantData?.app_theme_color}
        >
            {children}
        </RootLayoutUI>
    );
}
