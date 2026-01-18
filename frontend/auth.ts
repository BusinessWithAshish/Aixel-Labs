import NextAuth, { DefaultSession, CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { getCollection, MongoCollections, type UserDoc, type TenantDoc, type ModuleAccess, MongoObjectId } from '@aixellabs/shared/mongodb';
import { z } from 'zod';

// Custom error classes for specific error types
class UserNotFoundError extends CredentialsSignin {
    code = 'USER_NOT_FOUND';
}

class UserNotInTenantError extends CredentialsSignin {
    code = 'USER_NOT_IN_TENANT';
}

class InvalidPasswordError extends CredentialsSignin {
    code = 'INVALID_PASSWORD';
}

class InvalidCredentialsError extends CredentialsSignin {
    code = 'INVALID_CREDENTIALS';
}

declare module 'next-auth' {
    interface User {
        id: string;
        email: string;
        name?: string;
        isAdmin: boolean;
        tenantId: string;
        moduleAccess?: ModuleAccess;
    }

    interface Session {
        user: {
            id: string;
            email: string;
            name?: string;
            isAdmin: boolean;
            tenantId: string;
            moduleAccess?: ModuleAccess;
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

                    const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
                    const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);

                    // Find the tenant by name to get its ObjectId
                    const tenant = await tenantsCollection.findOne({ name: tenantId });
                    
                    if (!tenant) {
                        // Tenant doesn't exist
                        throw new UserNotInTenantError();
                    }

                    // Check if user exists with this email (regardless of tenant)
                    const userByEmail = await usersCollection.findOne({ email });

                    if (!userByEmail) {
                        // User doesn't exist at all
                        throw new UserNotFoundError();
                    }

                    // Check if user exists with this email AND tenant
                    const user = await usersCollection.findOne({ 
                        email, 
                        tenantId: tenant._id 
                    });

                    if (!user) {
                        // User exists but not for this tenant
                        throw new UserNotInTenantError();
                    }

                    // Plain text password comparison (not secure for production)
                    if (password !== user.password) {
                        throw new InvalidPasswordError();
                    }

                    return {
                        id: user._id.toString(),
                        email: user.email,
                        name: user.name,
                        isAdmin: user.isAdmin,
                        tenantId: tenantId, // Return the tenant name as string for the session
                        moduleAccess: user.moduleAccess,
                    };
                } catch (error) {
                    // Re-throw custom credential errors
                    if (
                        error instanceof UserNotFoundError ||
                        error instanceof UserNotInTenantError ||
                        error instanceof InvalidPasswordError
                    ) {
                        throw error;
                    }
                    // For validation errors or any other errors
                    console.error('Authorization error:', error);
                    throw new InvalidCredentialsError();
                }
            },
        }),
    ],

    session: {
        strategy: 'jwt',
    },

    callbacks: {
        async jwt({ token, user }) {
            // On first sign-in, store data
            if (user) {
              token.id = user.id;
              token.tenantId = user.tenantId;
            }
        
            // IMPORTANT PART: Re-fetch the latest user from DB
            const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
        
            const freshUser = await usersCollection.findOne({
              _id: new MongoObjectId(token.id as string),
            });
        
            if (freshUser) {
              token.email = freshUser.email;
              token.name = freshUser.name;
              token.isAdmin = freshUser.isAdmin;
              token.moduleAccess = freshUser.moduleAccess;
              token.tenantId = freshUser.tenantId.toString();
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
                session.user.moduleAccess = token.moduleAccess as ModuleAccess | undefined;
            }
            return session;
        },
    },
    pages: {
        signIn: '/sign-in',
    },
});
