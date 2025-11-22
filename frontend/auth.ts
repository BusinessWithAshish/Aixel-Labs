import NextAuth, { DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { getCollection } from '@/lib/mongodb';
import { z } from 'zod';

declare module 'next-auth' {
    interface User {
        id: string;
        email: string;
        name?: string;
        isAdmin: boolean;
        tenantId: string;
    }

    interface Session {
        user: {
            id: string;
            email: string;
            name?: string;
            isAdmin: boolean;
            tenantId: string;
        } & DefaultSession['user'];
    }
}

const signInSchema = z.object({
    email: z
        .string()
        .email('Invalid email')
        .transform((val) => val.trim().toLowerCase()),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    tenantId: z
        .string()
        .min(1, 'Tenant ID is required')
        .transform((val) => val.trim().toLowerCase()),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Credentials({
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
                tenantId: { label: 'Tenant ID', type: 'text' },
            },

            async authorize(rawCreds) {
                try {
                    const { email, password, tenantId } = await signInSchema.parseAsync(rawCreds);

                    const users = await getCollection('users');

                    // Check if user exists with this email (regardless of tenant)
                    const userByEmail = await users.findOne({ email });

                    if (!userByEmail) {
                        // User doesn't exist at all
                        throw new Error('USER_NOT_FOUND');
                    }

                    // Check if user exists with this email AND tenant
                    const user = await users.findOne({ email, tenantId });

                    if (!user) {
                        // User exists but not for this tenant
                        throw new Error('USER_NOT_IN_TENANT');
                    }

                    // Plain text password comparison (not secure for production)
                    if (password !== user.password) {
                        throw new Error('INVALID_PASSWORD');
                    }

                    return {
                        id: user._id.toString(),
                        email: user.email as string,
                        name: user.name as string | undefined,
                        isAdmin: Boolean(user.isAdmin),
                        tenantId: user.tenantId as string,
                    };
                } catch (error) {
                    // Re-throw custom errors
                    if (
                        error instanceof Error &&
                        (error.message === 'USER_NOT_FOUND' ||
                            error.message === 'USER_NOT_IN_TENANT' ||
                            error.message === 'INVALID_PASSWORD')
                    ) {
                        throw error;
                    }
                    // For any other errors (including validation errors)
                    throw new Error('INVALID_CREDENTIALS');
                }
            },
        }),
    ],

    session: {
        strategy: 'jwt',
    },

    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.email = user.email;
                token.name = user.name;
                token.isAdmin = user.isAdmin;
                token.tenantId = user.tenantId;
            }
            return token;
        },

        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.id as string;
                session.user.email = token.email as string;
                session.user.name = token.name as string | undefined;
                session.user.isAdmin = token.isAdmin as boolean;
                session.user.tenantId = token.tenantId as string;
            }
            return session;
        },
    },
    pages: {
        signIn: '/sign-in',
    },
});
