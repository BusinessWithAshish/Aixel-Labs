import {ReactNode} from "react";
import {SidebarInset, SidebarProvider, SidebarTrigger} from "@/components/ui/sidebar";
import {AppSidebar} from "../app-sidebar";
import {cn} from "@/lib/utils";

type PageLayoutProps = {
  children: ReactNode;
  className?: string;
  title: string | ReactNode;
}

export default function PageLayout(props: PageLayoutProps){

    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset className='p-2 space-y-2'>
                <header className="sticky bg-white flex justify-start items-center shadow-md w-full top-0 h-12 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
                    <SidebarTrigger />
                    {typeof props.title === 'string'
                        ? <span>{props.title}</span>
                        : props.title
                    }
                </header>
                <div className={cn("flex-1 overflow-auto", props.className)}>
                    {props.children}
                </div>
            </SidebarInset>
        </SidebarProvider>
    )
};