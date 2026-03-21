import type { Metadata } from 'next';
import '@/app/globals.css';
import { RootLayoutUI } from '@/components/common/RootLayout';
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

    // ONLY GET THE CURRENT TENANT AND PASS ITS UI INFO BELOW
    // PER TENANT VALIDATION LOGIC IS HANDLED ITS THEIR OWN LAYOUT FILES.
    const currentTenantData = await validateAndGetTenant();

    const tenantLogoUrl = currentTenantData?.app_logo_url;
    const tenantThemeColor = currentTenantData?.app_theme_color;

    return (
        <RootLayoutUI
            tenantLogoUrl={tenantLogoUrl}
            tenantThemeColor={tenantThemeColor}
        >
            {children}
        </RootLayoutUI>
    );
}
