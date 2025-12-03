import type { ObjectId } from "mongodb";

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

export type UserDoc = {
    email: string;
    name?: string;
    isAdmin: boolean;
    tenantId: ObjectId;
    password: string;
};

export type Tenant = {
    _id: string;
    name: string;
    redirect_url?: string;
};

export type CreateTenantInput = Omit<Tenant, '_id'>;
export type UpdateTenantInput = Partial<CreateTenantInput>;

export type TenantDoc = Omit<Tenant, '_id'>;
