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
    }

    interface Session {
        user: {
            id: string;
            email: string;
            name?: string;
            isAdmin: boolean;
        } & DefaultSession['user'];
    }
}

const signInSchema = z.object({
    email: z.string().email('Invalid email'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Credentials({
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },

            async authorize(rawCreds) {
                const { email, password } = await signInSchema.parseAsync(rawCreds);

                const users = await getCollection('users');
                const user = await users.findOne({ email });

                if (!user) return null;

                // Plain text password comparison (not secure for production)
                if (password !== user.password) return null;

                return {
                    id: user._id.toString(),
                    email: user.email as string,
                    name: user.name as string | undefined,
                    isAdmin: Boolean(user.isAdmin),
                };
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
            }
            return token;
        },

        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.id as string;
                session.user.email = token.email as string;
                session.user.name = token.name as string | undefined;
                session.user.isAdmin = token.isAdmin as boolean;
            }
            return session;
        },
    },
});
