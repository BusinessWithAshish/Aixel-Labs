'use client';

import { createContext, type ReactNode, useContext, useMemo } from 'react';

/**
 * Type definition for a custom hook that accepts no arguments
 */
export type CustomHook<T> = () => T;

/**
 * Type definition for a custom hook that accepts server data as an argument
 */
export type CustomHookWithData<TData, TReturn> = (data: TData) => TReturn;

/**
 * Context type that holds the hook's return value
 */
type TPageContext<T> = {
    hookResult: T | null;
};

/**
 * Props for the PageProvider component (client-side only hook)
 */
type PropsWithoutData<T> = {
    data?: never;
    children: ReactNode | ReactNode[];
    usePageHook: CustomHook<T>;
};

/**
 * Props for the PageProvider component (with server-side data)
 */
type PropsWithData<TData, TReturn> = {
    data: TData;
    children: ReactNode | ReactNode[];
    usePageHook: CustomHookWithData<TData, TReturn>;
};

/**
 * Combined props type
 */
type Props<TData, TReturn> = PropsWithoutData<TReturn> | PropsWithData<TData, TReturn>;

/**
 * Context for storing page-level state and logic
 */
export const PageContext = createContext<TPageContext<unknown>>({
    hookResult: null,
});

/**
 * PageProvider - A Higher-Order Component that wraps pages with a custom hook
 *
 * This component allows you to:
 * - Centralize all page logic in a custom hook
 * - Avoid prop drilling by using React Context API
 * - Maintain type safety with TypeScript generics
 * - Support both client-side only hooks and hooks that consume server-side data
 *
 * @example
 * ```tsx
 * // Client-side only (no server data)
 * export default function MyPage() {
 *   return (
 *     <PageProvider usePageHook={useMyPageLogic}>
 *       <MyPageContent />
 *     </PageProvider>
 *   );
 * }
 *
 * // With server-side data
 * export default async function MyPage() {
 *   const serverData = await fetchData();
 *   return (
 *     <PageProvider data={serverData} usePageHook={useMyPageLogic}>
 *       <MyPageContent />
 *     </PageProvider>
 *   );
 * }
 *
 * // In your component
 * function MyPageContent() {
 *   const { data, isLoading } = usePage<UseMyPageLogicReturn>();
 *   // Use the data...
 * }
 * ```
 */
export const PageProvider = <TData, TReturn>(props: Props<TData, TReturn>) => {
    const { data, usePageHook, children } = props;

    // Call the hook with data if provided, otherwise call it without arguments
    // This respects React's rules of hooks by calling it at the top level
    const hookResult =
        data !== undefined
            ? (usePageHook as CustomHookWithData<TData, TReturn>)(data)
            : (usePageHook as CustomHook<TReturn>)();

    const contextValue = useMemo(() => ({ hookResult }), [hookResult]);

    return <PageContext.Provider value={contextValue}>{children}</PageContext.Provider>;
};

/**
 * usePage - Hook to access the page context
 *
 * Must be used within a PageProvider. Throws an error if used outside of one.
 *
 * @throws {Error} If used outside of a PageProvider
 * @returns The return value of the custom hook passed to PageProvider
 *
 * @example
 * ```tsx
 * const { isLoading, data } = usePage<UseMyPageLogicReturn>();
 * ```
 */
export const usePage = <T,>(): T => {
    const context = useContext(PageContext) as TPageContext<T>;
    if (context === undefined || context.hookResult === null) {
        throw new Error('usePage must be used within a PageProvider');
    }
    return context.hookResult;
};
