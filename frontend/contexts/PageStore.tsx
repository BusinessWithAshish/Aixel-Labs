'use client';

import { createContext, type ReactNode, useContext, useMemo, Suspense } from 'react';
import { CommonLoader } from '@/components/common/CommonLoader';
import { NoDataFound } from '@/components/common/NoDataFound';

export type CustomHook<T> = () => T;

export type CustomHookWithData<TData, TReturn> = (data: TData) => TReturn;

type TPageContext<T> = {
    hookResult: T | null;
};

type PropsWithoutData<T> = {
    data?: never;
    children: ReactNode | ReactNode[];
    usePageHook: CustomHook<T>;
};

type PropsWithData<TData, TReturn> = {
    data: TData;
    children: ReactNode | ReactNode[];
    usePageHook: CustomHookWithData<TData, TReturn>;
};

type Props<TData, TReturn> = PropsWithoutData<TReturn> | PropsWithData<TData, TReturn>;

export const PageContext = createContext<TPageContext<unknown>>({
    hookResult: null,
});

export const PageProvider = <TData, TReturn>(props: Props<TData, TReturn>) => {
    const { data, usePageHook, children } = props;

    const hookResult =
        data !== undefined
            ? (usePageHook as CustomHookWithData<TData, TReturn>)(data)
            : (usePageHook as CustomHook<TReturn>)();

    const contextValue = useMemo(() => ({ hookResult }), [hookResult]);

    return <PageContext.Provider value={contextValue}>{children}</PageContext.Provider>;
};

export const usePage = <T,>(): T => {
    const context = useContext(PageContext) as TPageContext<T>;
    if (context === undefined || context.hookResult === null) {
        throw new Error('usePage must be used within a PageProvider');
    }
    return context.hookResult;
};

type DataFetchResult<T> = {
    success: boolean;
    data?: T;
    error?: string;
};

type WithPageDataProps<TData, TReturn> = {
    dataFetchResult: DataFetchResult<TData> | TData;
    usePageHook: CustomHookWithData<TData, TReturn>;
    children: ReactNode | ReactNode[];
    loadingText?: string;
    emptyMessage?: string;
};

export const withPageData = <TData, TReturn>(props: WithPageDataProps<TData, TReturn>) => {
    const { dataFetchResult, usePageHook, children, loadingText = 'Loading...', emptyMessage } = props;

    const isResultObject = dataFetchResult && typeof dataFetchResult === 'object' && 'success' in dataFetchResult;

    if (isResultObject) {
        const result = dataFetchResult as DataFetchResult<TData>;
        
        if (!result.success || !result.data) {
            return <NoDataFound />;
        }

        const data = result.data;
        const isEmpty = Array.isArray(data) && data.length === 0;

        if (isEmpty && emptyMessage) {
            return (
                <div className="flex items-center justify-center p-6">
                    <p className="text-muted-foreground">{emptyMessage}</p>
                </div>
            );
        }

        return (
            <Suspense fallback={<CommonLoader text={loadingText} />}>
                <PageProvider data={data} usePageHook={usePageHook}>
                    {children}
                </PageProvider>
            </Suspense>
        );
    }

    const data = dataFetchResult as TData;
    const isEmpty = Array.isArray(data) && data.length === 0;

    if (isEmpty && emptyMessage) {
        return (
            <div className="flex items-center justify-center p-6">
                <p className="text-muted-foreground">{emptyMessage}</p>
            </div>
        );
    }

    return (
        <Suspense fallback={<CommonLoader text={loadingText} />}>
            <PageProvider data={data} usePageHook={usePageHook}>
                {children}
            </PageProvider>
        </Suspense>
    );
};
