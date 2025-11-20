import { poppinsFont } from "@/helpers/fonts";
import { Toaster } from "@/components/ui/sonner";

export const RootLayoutUI = ({ children }: { children: React.ReactNode }) => {
    return (
        <html lang="en">
            <body className={`${poppinsFont.variable} h-dvh w-full`} suppressHydrationWarning>
                {children}
                <Toaster
                    closeButton={true}
                    position='top-right'
                    duration={3000}
                    richColors={true}
                    theme='light'
                    swipeDirections={['right', 'top']}
                />
            </body>
        </html>
    );
};