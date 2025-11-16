import Link from 'next/link';
import {poppinsFont} from "@/helpers/fonts";

export default function NotFound() {
    return (
        <html lang="en">
            <body className={`${poppinsFont.variable} h-dvh w-full`} suppressHydrationWarning>
                <div className="flex flex-col items-center justify-center h-full">
                    <div className="flex flex-col items-center justify-center h-full">
                        <h1 className="text-4xl font-bold">404 - Page Not Found</h1>
                        <p className="text-lg">The page you are looking for does not exist.</p>
                        <Link href="/" className="text-blue-500">
                            Go back to the home page
                        </Link>

                        <Link href="mailto:hello@aixellabs.com" className="text-blue-500">
                            Contact us
                        </Link>

                        <Link href="https://aixellabs.com" className="text-blue-500">
                            Visit our website
                        </Link>
                    </div>
                </div>
            </body>
        </html>
    );
}
