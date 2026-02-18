/**
 * Protected Not Found Page (404)
 *
 * This file handles unmatched routes under the `(protected)` segment.
 * It is rendered within the shared root layout, so it MUST NOT render
 * its own `<html>` or `<body>` tags.
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
