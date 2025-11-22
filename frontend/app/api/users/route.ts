import { NextRequest, NextResponse } from 'next/server';
import { getUsersByTenantId, updateUser } from '@/helpers/user-operations';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const tenantId = searchParams.get('tenantId');

        if (!tenantId) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Tenant ID is required',
                },
                { status: 400 },
            );
        }

        const users = await getUsersByTenantId(tenantId);

        return NextResponse.json(
            {
                success: true,
                data: users,
            },
            { status: 200 },
        );
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to fetch users',
                message: errorMessage,
            },
            { status: 500 },
        );
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const body = (await request.json()) as { id?: string; name?: string; isAdmin?: boolean };
        const { id, ...updateData } = body;

        if (!id) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'User ID is required',
                },
                { status: 400 },
            );
        }

        const updatedUser = await updateUser(id, updateData);

        if (!updatedUser) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'User not found or update failed',
                },
                { status: 404 },
            );
        }

        return NextResponse.json(
            {
                success: true,
                data: updatedUser,
                message: 'User updated successfully',
            },
            { status: 200 },
        );
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to update user',
                message: errorMessage,
            },
            { status: 500 },
        );
    }
}
