import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCollection, MongoCollections, type TenantDoc, type UserDoc } from '@aixellabs/backend/db';
import { extractSubdomain } from '@/middleware';
import { getFirebaseAdminAuth } from '@/lib/firebase/admin';
import { ensureUserAuthIndexes } from '@/lib/auth/ensure-user-indexes';
import { SESSION_COOKIE_EXPIRES_MS, SESSION_COOKIE_NAME } from '@/lib/auth/types';

/**
 * Exchange a Firebase ID token for an httpOnly session cookie.
 * Requires a linked phone number. Upserts the Mongo user for the current tenant.
 * @see https://firebase.google.com/docs/auth/admin/manage-cookies
 */
export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as { idToken?: string };
        const idToken = body.idToken?.toString();
        if (!idToken) {
            return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
        }

        const { subdomain: tenantName } = extractSubdomain(request.headers);
        if (!tenantName) {
            return NextResponse.json({ error: 'Tenant not found' }, { status: 400 });
        }

        const adminAuth = getFirebaseAdminAuth();
        const decoded = await adminAuth.verifyIdToken(idToken);

        if (!decoded.phone_number) {
            return NextResponse.json({ error: 'Phone number verification required' }, { status: 403 });
        }

        if (!decoded.email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 403 });
        }

        await ensureUserAuthIndexes();

        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);
        const tenant = await tenantsCollection.findOne({ name: tenantName.toLowerCase() });
        if (!tenant?._id) {
            return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
        }

        const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
        const email = decoded.email.toLowerCase();

        // Prefer Firebase UID; fall back to legacy email+tenant users (pre-Firebase accounts).
        let existing = await usersCollection.findOne({ firebaseUid: decoded.uid });
        if (!existing) {
            existing = await usersCollection.findOne({ email, tenantId: tenant._id });
        }

        if (existing) {
            if (!existing.tenantId.equals(tenant._id)) {
                return NextResponse.json({ error: 'Account is registered to a different organization' }, { status: 403 });
            }

            // Another Firebase account already owns this Mongo user.
            if (existing.firebaseUid && existing.firebaseUid !== decoded.uid) {
                return NextResponse.json(
                    { error: 'This email is already linked to a different Google account' },
                    { status: 403 },
                );
            }

            await usersCollection.updateOne(
                { _id: existing._id },
                {
                    $set: {
                        firebaseUid: decoded.uid,
                        email,
                        phoneNumber: decoded.phone_number,
                        ...(decoded.name ? { name: decoded.name } : {}),
                    },
                    $unset: { password: '' },
                },
            );
        } else {
            const doc: UserDoc = {
                firebaseUid: decoded.uid,
                email,
                phoneNumber: decoded.phone_number,
                name: decoded.name ?? undefined,
                isAdmin: false,
                tenantId: tenant._id,
                moduleAccess: {},
                credits: 0,
            };
            await usersCollection.insertOne(doc);
        }

        const sessionCookie = await adminAuth.createSessionCookie(idToken, {
            expiresIn: SESSION_COOKIE_EXPIRES_MS,
        });

        const response = NextResponse.json({ status: 'success' });
        response.cookies.set({
            name: SESSION_COOKIE_NAME,
            value: sessionCookie,
            maxAge: SESSION_COOKIE_EXPIRES_MS / 1000,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
        });
        return response;
    } catch (error) {
        console.error('Session create failed:', error);
        return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }
}

/**
 * Clear the session cookie and revoke refresh tokens when possible.
 */
export async function DELETE() {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

        if (sessionCookie) {
            try {
                const decoded = await getFirebaseAdminAuth().verifySessionCookie(sessionCookie);
                await getFirebaseAdminAuth().revokeRefreshTokens(decoded.sub);
            } catch {
                // Cookie may already be invalid; still clear it.
            }
        }

        const response = NextResponse.json({ status: 'success' });
        response.cookies.set({
            name: SESSION_COOKIE_NAME,
            value: '',
            maxAge: 0,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
        });
        return response;
    } catch (error) {
        console.error('Session delete failed:', error);
        return NextResponse.json({ error: 'Sign out failed' }, { status: 500 });
    }
}
