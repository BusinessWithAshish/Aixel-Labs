import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
} from "react";

/**
 * Type definition for a custom hook that can accept any arguments and return any type
 */
export type CustomHook<T> = (...props: unknown[]) => T;

/**
 * Context type that holds the hook's return value
 */
type TPageContext<T> = {
  usePageHook: T | null;
};

/**
 * Props for the PageProvider component
 */
type Props<T> = {
  children: ReactNode | ReactNode[];
  usePageHook: CustomHook<T>;
};

/**
 * Context for storing page-level state and logic
 */
export const PageContext = createContext<TPageContext<unknown>>({
  usePageHook: null,
});

/**
 * PageProvider - A Higher-Order Component that wraps pages with a custom hook
 * 
 * This component allows you to:
 * - Centralize all page logic in a custom hook
 * - Avoid prop drilling by using React Context API
 * - Maintain type safety with TypeScript generics
 * 
 * @example
 * ```tsx
 * // In your page.tsx
 * export default function MyPage() {
 *   return (
 *     <PageProvider usePageHook={useMyPageLogic}>
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
export const PageProvider = <T,>({ usePageHook, children }: Props<T>) => {
  const data = usePageHook();
  const contextValue = useMemo(() => ({ usePageHook: data }), [data]);

  return (
    <PageContext.Provider value={contextValue}>{children}</PageContext.Provider>
  );
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
  if (context === undefined || context.usePageHook === null) {
    throw new Error("usePage must be used within a PageProvider");
  }
  return context.usePageHook;
};
