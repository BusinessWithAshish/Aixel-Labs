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

import type { Metadata } from 'next';
import { RootLayoutUI } from '@/components/common/RootLayout';
import { CommonNotFoundComponent } from './(protected)/not-found';

export const metadata: Metadata = {
    title: '404 - Page Not Found',
    description: 'The page you are looking for does not exist.',
};

export default function NotFound() {
    return (
        <RootLayoutUI>
            <CommonNotFoundComponent />
        </RootLayoutUI>
    );
}
