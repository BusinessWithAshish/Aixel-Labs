import 'server-only';

import { getCollection, MongoCollections, type UserDoc } from '@aixellabs/backend/db';
import { getFirebaseAdminAuth } from '@/lib/firebase/admin';

/**
 * Deletes Firebase Auth users that no longer have any Mongo membership rows.
 * Call this after deleting user membership document(s) so that global Firebase
 * identities are cleaned up only when their last membership is gone.
 *
 * `firebaseUids` is deduplicated internally; callers may pass duplicates safely.
 * Errors from Firebase deletion are logged but never thrown — Mongo is the
 * source of truth for membership, and a stale Firebase UID is not fatal.
 */
export async function deleteOrphanedFirebaseUsers(firebaseUids: string[]): Promise<void> {
    const uniqueUids = [...new Set(firebaseUids.filter((uid): uid is string => Boolean(uid)))];
    if (uniqueUids.length === 0) return;

    const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
    const auth = getFirebaseAdminAuth();

    for (const firebaseUid of uniqueUids) {
        const remaining = await usersCollection.countDocuments({ firebaseUid });
        if (remaining === 0) {
            try {
                await auth.deleteUser(firebaseUid);
            } catch (error) {
                console.error('Failed to delete Firebase user:', error);
            }
        }
    }
}
