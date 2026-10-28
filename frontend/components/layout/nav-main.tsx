'use client';

import { ChevronRight, HomeIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link, { useLinkStatus } from 'next/link';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import type { SidebarNavItem } from '@/config/sidebar.config';
import { ReactNode, useEffect } from 'react';
import { Modules, SubModule } from '@aixellabs/backend/db/types';
import { modulesIconMap, subModuleIconMap, subModuleLabelMap, type SidebarKey, type SidebarPageKey } from '@/config/sidebar.config';
import { enumToTitleCase } from '@/helpers/string-helpers';
import { DEFAULT_HOME_PAGE_ROUTE, TENANT_HOME_PAGE_ROUTE } from '@/config/app-config';
import { eventBus } from '@/lib/event-bus';
import { cn } from '@/lib/utils';

/** Reports a link's navigation as loading, for the top progress bar. */
function LinkItem({ children }: { children: ReactNode }) {
    const { pending } = useLinkStatus();
    useEffect(() => {
        void eventBus.publish('navigation:loading', pending);
    }, [pending]);
    return <>{children}</>;
}

const labelOf = (key: SidebarKey) => subModuleLabelMap[key] ?? enumToTitleCase(key);

/** Whether `pathname` is this entry's page, or a page anywhere inside this folder. */
function holds(item: SidebarNavItem, pathname: string): boolean {
    if (item.url && (pathname === item.url || pathname.startsWith(`${item.url}/`))) return true;
    return item.items?.some((child) => holds(child, pathname)) ?? false;
}

/** A folder's entries, each a page or a folder of its own; folders nest as deep as the config goes. */
function NavEntries({ items, pathname, nested = false }: { items: SidebarNavItem[]; pathname: string; nested?: boolean }) {
    return (
        // Deeper folders keep the left rule but not its side margins, so three levels still fit the sidebar.
        <SidebarMenuSub className={cn(nested && 'mr-0 ml-2 pr-0')}>
            {items.map((item) => {
                const SubItemIcon = subModuleIconMap[item.title as SubModule | SidebarPageKey];
                const icon = SubItemIcon && <SubItemIcon.icon className={SubItemIcon.color} />;
                const label = labelOf(item.title);
                if (item.url) {
                    return (
                        <SidebarMenuSubItem key={item.title}>
                            <SidebarMenuSubButton asChild active={holds(item, pathname)}>
                                <Link prefetch={true} href={item.url}>
                                    <LinkItem>
                                        {icon}
                                        <span title={label}>{label}</span>
                                    </LinkItem>
                                </Link>
                            </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                    );
                }
                return (
                    <Collapsible key={item.title} asChild defaultOpen={holds(item, pathname)}>
                        <SidebarMenuSubItem>
                            <CollapsibleTrigger asChild>
                                <SidebarMenuSubButton asChild className="cursor-pointer data-[state=open]:[&>svg:last-child]:rotate-90">
                                    <button type="button" className="w-full">
                                        {icon}
                                        <span title={label}>{label}</span>
                                        <ChevronRight className="ml-auto transition-transform duration-200" />
                                    </button>
                                </SidebarMenuSubButton>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <NavEntries items={item.items ?? []} pathname={pathname} nested />
                            </CollapsibleContent>
                        </SidebarMenuSubItem>
                    </Collapsible>
                );
            })}
        </SidebarMenuSub>
    );
}

export function NavMain({ items }: { items: SidebarNavItem[] }) {
    const pathname = usePathname();

    return (
        <SidebarGroup>
            <SidebarMenuButton
                tooltip="Home"
                className="cursor-pointer"
                asChild
                active={pathname === TENANT_HOME_PAGE_ROUTE}
            >
                <Link prefetch={true} href={DEFAULT_HOME_PAGE_ROUTE}>
                    <LinkItem>
                        <HomeIcon className="size-4 shrink-0" />
                        <span className="group-data-[collapsible=icon]:hidden">Home</span>
                    </LinkItem>
                </Link>
            </SidebarMenuButton>
            <SidebarGroupLabel>Platform</SidebarGroupLabel>
            <SidebarMenu>
                {items.map((item) => {
                    const itemActive = holds(item, pathname);
                    const Icon = modulesIconMap[item.title as Modules];
                    const label = labelOf(item.title);

                    return (
                        <Collapsible key={item.title} asChild defaultOpen={itemActive} className="group/collapsible">
                            <SidebarMenuItem>
                                <CollapsibleTrigger asChild>
                                    <SidebarMenuButton className='cursor-pointer' tooltip={label} active={itemActive}>
                                        {Icon && <Icon />}
                                        <span>{label}</span>
                                        <ChevronRight className="ml-auto cursor-pointer transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 group-data-[state=open]/collapsible:text-primary" />
                                    </SidebarMenuButton>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <NavEntries items={item.items ?? []} pathname={pathname} />
                                </CollapsibleContent>
                            </SidebarMenuItem>
                        </Collapsible>
                    );
                })}
            </SidebarMenu>
        </SidebarGroup>
    );
}
