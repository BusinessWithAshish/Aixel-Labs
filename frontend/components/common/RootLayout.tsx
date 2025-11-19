import { poppinsFont } from "@/helpers/fonts";

export const RootLayoutUI = ({ children }: { children: React.ReactNode }) => {
    return (
        <html lang="en">
            <body className={`${poppinsFont.variable} h-dvh w-full`} suppressHydrationWarning>
                {children}
            </body>
        </html>
    );
};