import { poppinsFont } from '@/helpers/fonts';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/components/common/ThemeProvider';

type RootLayoutUIProps = {
    children: React.ReactNode;
    className?: string;
};

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
