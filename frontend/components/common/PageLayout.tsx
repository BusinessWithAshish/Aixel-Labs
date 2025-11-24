'use client';

import { ReactNode, useCallback, useMemo } from 'react';
import { SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { ChevronLeft } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

type PageLayoutProps = {
    children: ReactNode;
    className?: string;
    title: string | ReactNode;
};

export default function PageLayout(props: PageLayoutProps) {
    const router = useRouter();
    const pathname = usePathname();

    const handleGoBack = useCallback(() => {
        router.back();
    }, [router]);

    const isBackButtonVisible = useMemo(() => {
        return pathname !== '/';
    }, [pathname]);

    return (
        <SidebarInset className="p-2 rounded-md space-y-2 h-dvh">
            <header className="z-10 sticky p-3 backdrop-blur-lg rounded-md flex justify-start items-center border shadow-md drop-shadow-md w-full top-2 h-12 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 shrink-0">
                <SidebarTrigger />
                {isBackButtonVisible && <ChevronLeft className="w-4 mx-2 cursor-pointer h-4" onClick={handleGoBack} />}
                {typeof props.title === 'string' ? <span>{props.title}</span> : props.title}
            </header>
            <div className={cn('flex-1 overflow-auto', props.className)}>{props.children}</div>
        </SidebarInset>
    );
}
