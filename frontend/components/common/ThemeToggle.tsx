'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItems,
    DropdownMenuTrigger,
    type DropdownMenuOption,
} from '@/components/ui/dropdown-menu';
import { SidebarMenuButton } from '@/components/ui/sidebar';

export const ThemeToggle = () => {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return (
            <SidebarMenuButton tooltip="Toggle theme">
                <Sun className="h-4 w-4" />
            </SidebarMenuButton>
        );
    }

    const getIcon = () => {
        if (theme === 'light') return <Sun className="h-4 w-4" />;
        if (theme === 'dark') return <Moon className="h-4 w-4" />;
        return <Monitor className="h-4 w-4" />;
    };

    const options: DropdownMenuOption[] = [
        { key: 'light', label: 'Light', icon: Sun, variant: theme === 'light' ? 'primary' : undefined, onSelect: () => setTheme('light') },
        { key: 'dark', label: 'Dark', icon: Moon, variant: theme === 'dark' ? 'primary' : undefined, onSelect: () => setTheme('dark') },
        { key: 'system', label: 'System', icon: Monitor, variant: theme === 'system' ? 'primary' : undefined, onSelect: () => setTheme('system') },
    ];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="cursor-pointer hover:text-primary" tooltip="Toggle theme">
                    {getIcon()}
                    <span className="group-data-[collapsible=icon]:hidden">Toggle theme</span>
                </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItems options={options} />
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
