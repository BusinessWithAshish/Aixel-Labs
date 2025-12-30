/**
 * Root Not Found Page (404)
 *
 * This file handles all unmatched routes in the Next.js 15 app directory.
 * According to Next.js conventions, this file:
 * - Must be named `not-found.tsx` in the app directory
 * - Automatically catches all 404 errors at the root level
 * - Can be triggered programmatically using `notFound()` from 'next/navigation'
 * - Must include its own <html> and <body> tags as it bypasses the root layout
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/not-found
 */

import Link from 'next/link';
import PageLayout from '@/components/common/PageLayout';
import { DEFAULT_HOME_PAGE_ROUTE } from '@/config/app-config';

export const CommonNotFoundComponent = () => {
    return (
        <div className="flex flex-col items-center justify-center h-full">
            <h1 className="text-4xl font-bold">404 - Page Not Found</h1>
            <p className="text-lg">The page you are looking for does not exist.</p>
            <Link href={DEFAULT_HOME_PAGE_ROUTE} className="text-primary">
                Go back to the home page
            </Link>
        </div>
    );
};

export default function NotFound() {
    return (
        <PageLayout className="h-full" title="404 - Page Not Found">
            <CommonNotFoundComponent />
        </PageLayout>
    );
}
