'use server';

import { getCollection } from '@/lib/mongodb';
import { ObjectId, type Document } from 'mongodb';

export type User = {
    _id: string;
    email: string;
    name?: string;
    isAdmin: boolean;
    tenantId: string;
};

export type CreateUserInput = {
    email: string;
    password: string;
    name?: string;
    isAdmin?: boolean;
    tenantId: string;
};

export type UpdateUserInput = {
    name?: string;
    isAdmin?: boolean;
};

type UserDoc = {
    email: string;
    name?: string;
    isAdmin: boolean;
    tenantId: string;
    password: string;
};

export const getUsersByTenantId = async (tenantId: string): Promise<User[]> => {
    try {
        const collection = await getCollection<Document>('users');
        const users = await collection.find({ tenantId }).toArray();
        return JSON.parse(
            JSON.stringify(
                users.map((user) => ({
                    _id: user._id.toString(),
                    email: user.email,
                    name: user.name,
                    isAdmin: Boolean(user.isAdmin),
                    tenantId: user.tenantId,
                })),
            ),
        );
    } catch {
        return [];
    }
};

export const createUser = async (input: CreateUserInput): Promise<User | null> => {
    try {
        if (!input.email || !input.password || !input.tenantId) return null;

        const collection = await getCollection<Document>('users');

        // Check if user already exists with this email and tenantId
        const existingUser = await collection.findOne({
            email: input.email.trim().toLowerCase(),
            tenantId: input.tenantId,
        });

        if (existingUser) {
            return null; // User already exists
        }

        const doc: UserDoc = {
            email: input.email.trim().toLowerCase(),
            password: input.password,
            name: input.name?.trim(),
            isAdmin: Boolean(input.isAdmin),
            tenantId: input.tenantId,
        };

        const result = await collection.insertOne(doc);

        return JSON.parse(
            JSON.stringify({
                _id: result.insertedId.toString(),
                email: doc.email,
                name: doc.name,
                isAdmin: doc.isAdmin,
                tenantId: doc.tenantId,
            }),
        );
    } catch {
        return null;
    }
};

export const updateUser = async (id: string, input: UpdateUserInput): Promise<User | null> => {
    try {
        if (!ObjectId.isValid(id)) return null;

        const collection = await getCollection<Document>('users');

        const updateFields: Partial<UserDoc> = {};
        if (input.name !== undefined) updateFields.name = input.name;
        if (input.isAdmin !== undefined) updateFields.isAdmin = input.isAdmin;

        const result = await collection.findOneAndUpdate(
            { _id: new ObjectId(id) },
            { $set: updateFields },
            { returnDocument: 'after' },
        );

        if (!result) return null;

        return JSON.parse(
            JSON.stringify({
                _id: result._id.toString(),
                email: result.email,
                name: result.name,
                isAdmin: Boolean(result.isAdmin),
                tenantId: result.tenantId,
            }),
        );
    } catch {
        return null;
    }
};
