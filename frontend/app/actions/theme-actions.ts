'use server';

import { THEME_COLOR_COOKIE_KEY } from '@/helpers/theme-color-utils';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { DEFAULT_HOME_PAGE_ROUTE } from "@/config/app-config";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function setThemeColorAction(color: string): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.set(THEME_COLOR_COOKIE_KEY, color, {
        path: DEFAULT_HOME_PAGE_ROUTE,
        maxAge: ONE_YEAR_SECONDS,
        sameSite: 'lax',
    });
    revalidatePath(DEFAULT_HOME_PAGE_ROUTE, 'layout');
}

export async function clearThemeColorAction(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(THEME_COLOR_COOKIE_KEY);
    revalidatePath(DEFAULT_HOME_PAGE_ROUTE, 'layout');
}
