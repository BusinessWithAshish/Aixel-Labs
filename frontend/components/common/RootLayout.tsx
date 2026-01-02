import { poppinsFont } from '@/helpers/fonts';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/components/common/ThemeProvider';

type RootLayoutUIProps = {
    children: React.ReactNode;
    className?: string;
};

/**
 * RootLayoutUI - Only for root layout (app/layout.tsx)
 * Includes <html> and <body> tags
 */
export const RootLayoutUI = ({ children, className }: RootLayoutUIProps) => {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className={cn(`${poppinsFont.variable} h-dvh w-full`, className)} suppressHydrationWarning>
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
            </body>
        </html>
    );
};

/**
 * NestedLayoutWrapper - For nested layouts (public, protected, etc.)
 * Does NOT include <html> and <body> tags to avoid hydration errors
 */
export const NestedLayoutWrapper = ({ children }: { children: React.ReactNode }) => {
    return <>{children}</>;
};
