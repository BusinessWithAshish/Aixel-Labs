import {ReactNode} from "react";
import {SidebarInset, SidebarProvider, SidebarTrigger} from "@/components/ui/sidebar";
import {AppSidebar} from "../layout/app-sidebar";
import {cn} from "@/lib/utils";

type PageLayoutProps = {
    children: ReactNode;
    className?: string;
    title: string | ReactNode;
}

export default function PageLayout(props: PageLayoutProps) {

    return (
        <SidebarProvider>
            <AppSidebar/>
            <SidebarInset className='p-2 rounded-md space-y-2 flex flex-col h-screen'>
                <header
                    className="z-10 sticky p-3 backdrop-blur-lg rounded-md flex justify-start items-center border shadow-md drop-shadow-md w-full top-2 h-12 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 flex-shrink-0">
                    <SidebarTrigger/>
                    {typeof props.title === 'string'
                        ? <span>{props.title}</span>
                        : props.title
                    }
                </header>
                <div className={cn("flex-1 min-h-0", props.className)}>
                    {props.children}
                </div>
            </SidebarInset>
        </SidebarProvider>
    )
};