import { NextRequest, NextResponse } from 'next/server';

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

export async function middleware(req: NextRequest) {
    const { subdomain, hostname } = extractSubdomain(req);

    // Skip middleware for API routes explicitly (safety check)
    if (req.nextUrl.pathname.startsWith('/api')) {
        return NextResponse.next();
    }

    // Handle missing or www subdomain
    if (!subdomain || subdomain === 'www') {
        if (
            process.env.NODE_ENV === 'production' &&
            hostname.trim().toLowerCase() === process.env.ROOT_DOMAIN?.trim().toLowerCase()
        ) {
            return NextResponse.redirect(process.env.ROOT_URL as string);
        }
    }

    // Has subdomain - continue (validation happens in layout)
    // Just pass the request through, don't rewrite
    // The layout will handle tenant validation
    return NextResponse.next();
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
