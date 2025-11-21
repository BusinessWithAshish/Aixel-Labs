import { auth } from '@/auth';

export async function validateTenantAccess(tenantName: string) {
    const session = await auth();

    if (!session?.user) {
        return false;
    }

    const user = session.user;

    // Admin users can access any tenant
    if (user.isAdmin) {
        return true;
    }

    // Regular users can only access their assigned tenant
    return user.name?.toLowerCase() === tenantName.toLowerCase();
}
