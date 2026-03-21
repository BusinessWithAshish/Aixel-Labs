import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { DEFAULT_HOME_PAGE_ROUTE } from '@/config/app-config';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
    const session = await auth();

    if (session?.user) {
        redirect(DEFAULT_HOME_PAGE_ROUTE);
    }

    return children;
}
