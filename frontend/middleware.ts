import { NextRequest, NextResponse } from 'next/server';
import { Tenant, TenantType } from '@aixellabs/backend/db/types';
import {
    API_ROUTE_PREFIX,
    DEFAULT_HOME_PAGE_ROUTE,
    IFRAME_TENANTS_ROUTE_PREFIX,
    NOT_FOUND_ROUTE,
    PATHNAME_HEADER_KEY,
    PRODUCT_TENANTS_ROUTE_PREFIX,
    TENANT_API_ROUTE_PREFIX,
} from '@/config/app-config';
import { SUBDOMAIN_PARAM_NAME } from '@/config/app-config';
import { ALApiResponse } from '@aixellabs/backend/api/types';

export const extractSubdomain = (request: NextRequest | Headers) => {
    const host = request instanceof NextRequest ? request.headers.get('host') || '' : request.get('host') || '';

    const hostname = host.split(':')[0];
    const parts = hostname.split('.');

    return {
        subdomain: parts.length > 1 ? parts[0] : null,
        hostname,
        host,
    };
};

async function fetchTenantData(origin: string, subdomain: string) {
    const tenantApiUrl = `${origin}${API_ROUTE_PREFIX}${TENANT_API_ROUTE_PREFIX}?${SUBDOMAIN_PARAM_NAME}=${encodeURIComponent(subdomain)}`;

    try {
        const res = await fetch(tenantApiUrl);
        if (!res.ok) return null;
        const json = (await res.json()) as ALApiResponse<Tenant | null>;
        if (!json.success || !json.data) {
            return null;
        }
        return json.data;
    } catch (error) {
        console.error(`[middleware]: Error fetching tenant data for subdomain ${subdomain}:`, error);
        return null;
    }
}

function nextWithPathname(req: NextRequest, pathname: string) {
    const headers = new Headers(req.headers);
    headers.set(PATHNAME_HEADER_KEY, pathname);
    return NextResponse.next({ request: { headers } });
}

function rewriteWithPathname(req: NextRequest, url: URL, pathname: string) {
    const headers = new Headers(req.headers);
    headers.set(PATHNAME_HEADER_KEY, pathname);
    return NextResponse.rewrite(url, { request: { headers } });
}

export async function middleware(req: NextRequest) {
    const { subdomain, hostname } = extractSubdomain(req);
    const { pathname } = req.nextUrl;

    // Skip middleware for API routes explicitly (safety check)
    if (pathname.startsWith(API_ROUTE_PREFIX)) {
        return NextResponse.next();
    }

    // No subdomain or www -> redirect to root domain in production
    if (!subdomain || subdomain === 'www') {
        if (
            process.env.NODE_ENV === 'production' &&
            hostname.trim().toLowerCase() === process.env.NEXT_PUBLIC_ROOT_DOMAIN?.trim().toLowerCase()
        ) {
            return NextResponse.redirect(process.env.NEXT_PUBLIC_ROOT_URL as string);
        }
        return nextWithPathname(req, pathname);
    }

    // Skip rewrites for internal rewritten paths (avoid double rewrite)
    if (pathname.startsWith(PRODUCT_TENANTS_ROUTE_PREFIX) || pathname.startsWith(IFRAME_TENANTS_ROUTE_PREFIX)) {
        return nextWithPathname(req, pathname);
    }

    const tenant = await fetchTenantData(req.nextUrl.origin, subdomain);

    if (!tenant) {
        return NextResponse.rewrite(new URL(NOT_FOUND_ROUTE, req.url));
    }

    switch (tenant.type) {
        case TenantType.EXTERNAL: {
            if (tenant.redirect_url) {
                return NextResponse.redirect(tenant.redirect_url);
            }
            return NextResponse.rewrite(new URL(NOT_FOUND_ROUTE, req.url));
        }

        case TenantType.IFRAME: {
            // Iframe tenants are locked to the root path - force redirect to home
            if (pathname !== DEFAULT_HOME_PAGE_ROUTE) {
                return NextResponse.redirect(new URL(DEFAULT_HOME_PAGE_ROUTE, req.url));
            }
            return rewriteWithPathname(req, new URL(`${IFRAME_TENANTS_ROUTE_PREFIX}/${tenant.name}`, req.url), pathname);
        }

        case TenantType.PRODUCT: {
            const productPath = `${PRODUCT_TENANTS_ROUTE_PREFIX}/${tenant.name}${pathname === DEFAULT_HOME_PAGE_ROUTE ? '' : pathname}`;
            return rewriteWithPathname(req, new URL(productPath, req.url), pathname);
        }

        default: {
            // Normal tenant: pass through to (protected)/(public) routes
            return nextWithPathname(req, pathname);
        }
    }
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public files (files with extensions)
         */
        '/((?!api/|_next/static|_next/image|favicon.ico|.*\\..*).*)',
    ],
};
