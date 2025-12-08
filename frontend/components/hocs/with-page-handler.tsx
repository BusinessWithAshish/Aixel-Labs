import { ComponentType, ReactNode, Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { NoDataFound } from '../common/NoDataFound';
import { CommonLoader } from '@/components/common/CommonLoader';

/**
 * Configuration options for withPageHandler HOC
 */
type WithPageHandlerConfig = {
    loadingFallback?: ReactNode;
    errorFallback?: ReactNode;
};

/**
 * Enhanced HOC that wraps page components with ErrorBoundary and Suspense
 *
 * This HOC provides:
 * - Error boundary with custom fallback
 * - Suspense boundary with custom loader
 * - Proper async handling for Server Components
 *
 * The key benefit: Suspense is placed ABOVE the async Server Component,
 * so it properly catches async work during component execution.
 *
 * @example
 * ```tsx
 * // Server Component with async data fetching
 * async function MyPage() {
 *   const data = await fetchData(); // Caught by Suspense
 *
 *   return (
 *     <PageProvider data={data} usePageHook={useMyPageLogic}>
 *       <PageLayout title="My Page">
 *         <MyContent />
 *       </PageLayout>
 *     </PageProvider>
 *   );
 * }
 *
 * // Wrap with HOC
 * export default withPageHandler(MyPage);
 *
 * // Or with custom fallbacks
 * export default withPageHandler(MyPage, {
 *   loadingFallback: <CustomLoader />,
 *   errorFallback: <CustomError />
 * });
 * ```
 *
 * @example
 * ```tsx
 * // With other HOCs (e.g., withAdminOnly)
 * export default withAdminOnly(
 *   withPageHandler(MyPage),
 *   { pageTitle: 'My Page' }
 * );
 * ```
 */
export function withPageHandler<P extends object>(
    PageComponent: ComponentType<P>,
    config?: WithPageHandlerConfig,
): ComponentType<P> {
    const { loadingFallback, errorFallback } = config || {};

    function WrappedPage(props: P) {
        return (
            <ErrorBoundary fallback={errorFallback || <NoDataFound />}>
                <Suspense fallback={loadingFallback || <CommonLoader />}>
                    <PageComponent {...props} />
                </Suspense>
            </ErrorBoundary>
        );
    }

    // Preserve display name for debugging
    WrappedPage.displayName = `withPageHandler(${PageComponent.displayName || PageComponent.name || 'Component'})`;

    return WrappedPage;
}
