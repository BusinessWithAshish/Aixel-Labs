'use client';

import { ChevronRight } from 'lucide-react';
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
import { getIcon } from '@/lib/icon-map';
import { useCallback } from 'react';

export function NavMain({ items }: { items: SidebarNavItem[];}) {
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
            <SidebarGroupLabel>Platform</SidebarGroupLabel>
            <SidebarMenu>
                {items.map((item) => {
                    const itemActive = isItemActive(item);
                    const Icon = item.icon ? getIcon(item.icon) : null;

                    return (
                        <Collapsible key={item.title} asChild defaultOpen={itemActive} className="group/collapsible">
                            <SidebarMenuItem>
                                <CollapsibleTrigger asChild>
                                    <SidebarMenuButton tooltip={item.title} isActive={itemActive}>
                                        {Icon && <Icon />}
                                        <span>{item.title}</span>
                                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                    </SidebarMenuButton>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <SidebarMenuSub>
                                        {item.items?.map((subItem) => (
                                            <SidebarMenuSubItem key={subItem.title}>
                                                <SidebarMenuSubButton asChild isActive={isSubItemActive(subItem.url)}>
                                                    <Link href={subItem.url}>
                                                        <span>{subItem.title}</span>
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
