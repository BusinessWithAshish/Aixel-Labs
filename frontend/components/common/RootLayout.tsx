import { poppinsFont } from '@/helpers/fonts';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';

type RootLayoutUIProps = {
    children: React.ReactNode;
    className?: string;
};

export const RootLayoutUI = ({ children, className }: RootLayoutUIProps) => {
    return (
        <html lang="en">
            <body className={cn(`${poppinsFont.variable} h-dvh w-full`, className)} suppressHydrationWarning>
                {children}
                <Toaster
                    closeButton={true}
                    position="top-right"
                    duration={3000}
                    richColors={true}
                    theme="light"
                    swipeDirections={['right', 'top']}
                />
            </body>
        </html>
    );
};
