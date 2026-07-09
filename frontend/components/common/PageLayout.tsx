'use client';

import { ReactNode, useCallback, useMemo } from 'react';
import { SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { ChevronLeft } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { DEFAULT_HOME_PAGE_ROUTE } from '@/config/app-config';
import { CreditsBadge } from '@/components/common/credits/CreditsBadge';

type PageLayoutProps = {
    children: ReactNode;
    className?: string;
    title: string | ReactNode;
    headerEnd?: ReactNode | null;
};

export default function PageLayout({ children, className, title, headerEnd }: PageLayoutProps) {
    const router = useRouter();
    const pathname = usePathname();

    const handleGoBack = useCallback(() => {
        router.back();
    }, [router]);

    const isBackButtonVisible = useMemo(() => {
        return pathname !== DEFAULT_HOME_PAGE_ROUTE;
    }, [pathname]);

    const end = headerEnd === undefined ? <CreditsBadge /> : headerEnd;

    return (
        <SidebarInset id="sidebar-inset" className="p-2 rounded-md gap-4 overflow-hidden">
            <header
                id="header"
                className="z-10 sticky p-3 backdrop-blur-lg rounded-md flex justify-start items-center border shadow-md drop-shadow-md w-full top-2 h-12 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 shrink-0"
            >
                <SidebarTrigger />
                {isBackButtonVisible && (
                    <ChevronLeft
                        className="w-4 mx-2 hover:bg-secondary cursor-pointer h-4"
                        onClick={handleGoBack}
                    />
                )}
                {typeof title === 'string' ? <span>{title}</span> : title}
                {end ? <div className="ml-auto flex items-center gap-2 shrink-0">{end}</div> : null}
            </header>
            <div id="page-children-container" className={cn('flex-1 overflow-auto', className)}>
                {children}
            </div>
        </SidebarInset>
    );
}
