import type {Metadata} from 'next';
import '@/app/globals.css';
import {getCurrentTenant, validateTenant} from '@/helpers/validate-tenant';
import NotFound from '@/components/layout/not-found';
import {poppinsFont} from "@/helpers/fonts";

export const metadata: Metadata = {
    title: 'Aixellabs',
    description: 'Agentic Lead management system',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    const currentTenant = await getCurrentTenant();
    if (!currentTenant) {
        return <NotFound />;
    }

    const isTenantValid = await validateTenant(currentTenant);
    if (!isTenantValid) {
        return <NotFound />;
    }

    return (
        <html lang="en">
            <body className={`${poppinsFont.variable} h-dvh w-full`} suppressHydrationWarning>
                {children}
            </body>
        </html>
    );
}
