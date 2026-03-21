import { NextResponse } from 'next/server';
import { getTenantByNamePublic } from '@/app/actions/tenant-actions';
import { SUBDOMAIN_PARAM_NAME } from '@/config/app-config';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import { Tenant } from '@aixellabs/backend/db/types';

export async function GET(request: Request): Promise<NextResponse<ALApiResponse<Tenant | null>>> {
    try {
        const { searchParams } = new URL(request.url);
        const name = searchParams.get(SUBDOMAIN_PARAM_NAME);

        if (!name) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Tenant name is required',
                },
                { status: 400 },
            );
        }

        const currentTenantData = await getTenantByNamePublic(name);

        if (!currentTenantData.success || !currentTenantData.data) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Tenant not found',
                },
                { status: 404 },
            );
        }

        return NextResponse.json(currentTenantData);
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to get tenant data',
            },
            { status: 500 },
        );
    }
}
