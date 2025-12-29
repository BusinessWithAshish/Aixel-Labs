import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';

/**
 * Higher-Order Component (HOC) that wraps a page component and ensures
 * only admin users can access it. Non-admin users will see a 404 error.
 *
 * @example
 * ```tsx
 * export default withAdminOnly(async function ManageTenantsPage() {
 *   return <div>Admin content here</div>
 * })
 * ```
 */
export function withAdminOnly<P extends object>(Component: React.ComponentType<P>) {
    return async function AdminProtectedPage(props: P) {
        const session = await auth();

        if (!session?.user) {
            redirect('/sign-in');
        }

        if (!session.user.isAdmin) {
            notFound();
        }

        return <Component {...props} />;
    };
}
