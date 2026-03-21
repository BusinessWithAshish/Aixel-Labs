/**
 * Root Not Found Page (404)
 *
 * This file handles all unmatched routes in the Next.js app directory.
 * According to Next.js conventions, this file:
 * - Must be named `not-found.tsx` in the app directory
 * - Automatically catches all 404 errors at the root level
 * - Is rendered inside the root `app/layout.tsx` (it should NOT render its own <html> or <body> tags)
 * - Can be triggered programmatically using `notFound()` from 'next/navigation'
 *
 * For normal tenants: This will be used for invalid routes that don't match
 * any page in (protected) or (public) route groups. Since route groups are
 * transparent to routing and we can't use catch-all routes in both groups,
 * we need to make this component smart enough to detect authentication
 * and render with or without the sidebar accordingly.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/not-found
 */

import type { Metadata } from 'next';
import { auth } from '@/auth';
import PageLayout from '@/components/common/PageLayout';
import { CommonNotFound } from "@/components/common/CommonNotFound";
import { ProtectedLayout } from '@/components/common/ProtectedLayout';

export const metadata: Metadata = {
    title: '404 - Page Not Found',
    description: 'The page you are looking for does not exist.',
};

export default async function NotFound() {
    // Check if user is authenticated to determine layout
    const session = await auth();

    // If authenticated, render with sidebar (like protected routes)
    if (session?.user) {
        return (
            <ProtectedLayout>
                <PageLayout className="h-full" title="404 - Page Not Found">
                    <CommonNotFound />
                </PageLayout>
            </ProtectedLayout>
        );
    }

    // If not authenticated, render without sidebar (like public routes)
    return <CommonNotFound />;
}
