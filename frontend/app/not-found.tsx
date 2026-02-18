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
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/not-found
 */

import type { Metadata } from 'next';
import { CommonNotFoundComponent } from './(protected)/not-found';

export const metadata: Metadata = {
    title: '404 - Page Not Found',
    description: 'The page you are looking for does not exist.',
};

export default function NotFound() {
    return <CommonNotFoundComponent />;
}
