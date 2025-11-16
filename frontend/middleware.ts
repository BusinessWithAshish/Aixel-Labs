import { NextRequest, NextResponse } from 'next/server';

export const extractSubdomain = (request: NextRequest | Headers) => {
    let host = '';
    if (request instanceof NextRequest) {
        host = request.headers.get('host') || '';
    } else {
        host = request.get('host') || '';
    }
    const hostname = host.split(':')[0];

    const parts = hostname.split('.');
    if (parts.length > 1) {
        return {
            subdomain: parts[0],
            hostname: hostname,
        };
    }

    return {
        subdomain: null,
        hostname: hostname,
    };
};

export async function middleware(req: NextRequest) {
    const { subdomain, hostname } = extractSubdomain(req);

    // No subdomain - block access
    if (!subdomain || subdomain === 'www') {
        if (process.env.NODE_ENV === 'production') {
            // Production: redirect root domain to marketing site
            if (hostname.trim().toLowerCase() === process.env.ROOT_DOMAIN?.trim().toLowerCase()) {
                return NextResponse.redirect(process.env.ROOT_URL as string);
            }
        }
    }

    // Has subdomain - continue (validation happens in layout)
    // Just pass the request through, don't rewrite
    // The layout will handle tenant validation
    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
