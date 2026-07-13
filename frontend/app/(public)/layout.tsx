import { getAppSession } from '@/server/auth';
import { redirect } from 'next/navigation';
import { DEFAULT_HOME_PAGE_ROUTE } from '@/config/app-config';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
    const session = await getAppSession();

    if (session?.user) {
        redirect(DEFAULT_HOME_PAGE_ROUTE);
    }

    return children;
}
