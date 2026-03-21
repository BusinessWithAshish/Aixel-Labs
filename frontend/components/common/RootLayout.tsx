import { poppinsFont } from '@/helpers/fonts';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/components/common/ThemeProvider';
import { TenantBrandingProvider } from '@/contexts/TenantBranding';
import { buildThemeStyleTag, THEME_COLOR_COOKIE_KEY } from '@/helpers/theme-color-utils';
import { DEFAULT_THEME_COLOR } from '@/config/app-config';
import { cookies } from 'next/headers';
import Head from "next/head";

type RootLayoutUIProps = {
    children: React.ReactNode;
    className?: string;
    tenantLogoUrl?: string;
    tenantThemeColor?: string;
};

/**
 * RootLayoutUI - Only for root layout (app/layout.tsx).
 * Reads the theme-color cookie server-side and injects an inline <style> tag
 * so the correct color is present in the first byte of HTML — zero flicker.
 */
export const RootLayoutUI = async ({
    children,
    className,
    tenantLogoUrl,
    tenantThemeColor,
}: RootLayoutUIProps) => {
    const cookieStore = await cookies();
    const savedColor = cookieStore.get(THEME_COLOR_COOKIE_KEY)?.value;
    const activeColor = savedColor ?? tenantThemeColor ?? DEFAULT_THEME_COLOR;

    return (
        <html lang="en" suppressHydrationWarning>
            <Head>
                <style dangerouslySetInnerHTML={{ __html: buildThemeStyleTag(activeColor) }} />
            </Head>
            <body className={cn(`${poppinsFont.variable} h-dvh w-full`, className)} suppressHydrationWarning>

                <TenantBrandingProvider
                    appLogoUrl={tenantLogoUrl}
                    defaultThemeColor={tenantThemeColor}
                    themeColor={activeColor}
                >
                    <ThemeProvider>
                        {children}
                        <Toaster
                            closeButton={true}
                            position="top-right"
                            duration={3000}
                            richColors={true}
                            swipeDirections={['right', 'top']}
                        />
                    </ThemeProvider>
                </TenantBrandingProvider>

            </body>
        </html>
    );
};
