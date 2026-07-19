import type { UserDoc } from '@aixellabs/backend/db';
import type { AppSessionUser } from '@/lib/auth/types';

export function mapUserDocToAppSessionUser(
    user: UserDoc & { _id: NonNullable<UserDoc['_id']> },
    tenantName: string,
): AppSessionUser {
    return {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        tenantId: tenantName,
        tenantName,
        moduleAccess: user.moduleAccess,
    };
}
