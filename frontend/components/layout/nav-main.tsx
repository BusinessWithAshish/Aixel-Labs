'use client';

import { ChevronRight, HomeIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

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
import { useCallback } from 'react';
import { Modules } from '@aixellabs/shared/mongodb';
import { modulesIconMap } from '@/config/sidebar.config';
import { enumToTitleCase } from '@/helpers/string-helpers';
import { DEFAULT_HOME_PAGE_ROUTE } from '@/config/app-config';

export function NavMain({ items }: { items: SidebarNavItem[] }) {
    const pathname = usePathname();

    // Memoize isItemActive to recalculate only when pathname or items change
    const isItemActive = useCallback(
        (item: (typeof items)[0]) => {
            // Check if current path matches the main item
            if (pathname === item.url) return true;

            // Check if any sub-item matches the current path
            return item.items?.some((subItem) => pathname === subItem.url) ?? false;
        },
        [pathname],
    );

    // Memoize isSubItemActive for stability; depends only on pathname
    const isSubItemActive = useCallback(
        (url: string) => {
            return pathname === url;
        },
        [pathname],
    );

    return (
        <SidebarGroup>
            <SidebarMenuButton asChild isActive={pathname === DEFAULT_HOME_PAGE_ROUTE}>
                <Link href={DEFAULT_HOME_PAGE_ROUTE}>
                    <HomeIcon className="size-4 shrink-0" />
                    <span className="group-data-[collapsible=icon]:hidden">Home</span>
                </Link>
            </SidebarMenuButton>
            <SidebarGroupLabel>Platform</SidebarGroupLabel>
            <SidebarMenu>
                {items.map((item) => {
                    const itemActive = isItemActive(item);
                    const Icon = modulesIconMap[item.title as Modules];

                    return (
                        <Collapsible key={item.title} asChild defaultOpen={itemActive} className="group/collapsible">
                            <SidebarMenuItem>
                                <CollapsibleTrigger asChild>
                                    <SidebarMenuButton tooltip={enumToTitleCase(item.title)} isActive={itemActive}>
                                        {Icon && <Icon className="size-4 shrink-0" />}
                                        <Link href={item.url}>
                                            <span>{enumToTitleCase(item.title)}</span>
                                        </Link>
                                        <ChevronRight className="ml-auto cursor-pointer transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 group-data-[state=open]/collapsible:text-primary" />
                                    </SidebarMenuButton>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <SidebarMenuSub>
                                        {item.items?.map((subItem) => (
                                            <SidebarMenuSubItem key={subItem.title}>
                                                <SidebarMenuSubButton asChild isActive={isSubItemActive(subItem.url)}>
                                                    <Link href={subItem.url}>
                                                        <span>{enumToTitleCase(subItem.title)}</span>
                                                    </Link>
                                                </SidebarMenuSubButton>
                                            </SidebarMenuSubItem>
                                        ))}
                                    </SidebarMenuSub>
                                </CollapsibleContent>
                            </SidebarMenuItem>
                        </Collapsible>
                    );
                })}
            </SidebarMenu>
        </SidebarGroup>
    );
}
