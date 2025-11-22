import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import PageLayout from '@/components/common/PageLayout';
import NotFound from '@/components/layout/not-found';

/**
 * Higher-Order Component (HOC) that wraps a page component and ensures
 * only admin users can access it. Non-admin users will see a 403 error.
 *
 * @example
 * ```tsx
 * export default withAdminOnly(async function ManageTenantsPage() {
 *   return <div>Admin content here</div>
 * })
 * ```
 */
export function withAdminOnly<P extends object>(Component: React.ComponentType<P>, options?: { pageTitle?: string }) {
    return async function AdminProtectedPage(props: P) {
        const session = await auth();

        if (!session?.user) {
            redirect('/sign-in');
        }

        if (!session.user.isAdmin) {
            return (
                <PageLayout title={options?.pageTitle || 'Page Not Found'}>
                    <NotFound />
                </PageLayout>
            );
        }

        return <Component {...props} />;
    };
}
