import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { PATHNAME_HEADER_KEY, PRODUCT_TENANTS_ROUTE_PREFIX } from '@/config/app-config';

/**
 * Metadata that lets a product be put on a phone's home screen as an app of its own.
 *
 * `assets` is the product's folder under `public/` (for example `/business`), holding
 * `manifest.webmanifest`, `icon-192.png` and `apple-touch-icon.png`.
 *
 * Installing is only offered on the product's own address (business.…, bluff.…), where "/" is
 * the product: there the middleware passes on a path that does not start with `/products`. Under
 * the main site's `/products/<name>` the same manifest would install the whole site, so it is
 * left out, and only the icons are set.
 */
export async function installMetadata(assets: string, title: string): Promise<Metadata> {
    const pathname = (await headers()).get(PATHNAME_HEADER_KEY) ?? PRODUCT_TENANTS_ROUTE_PREFIX;
    const onOwnAddress = !pathname.startsWith(PRODUCT_TENANTS_ROUTE_PREFIX);
    return {
        icons: { icon: `${assets}/icon-192.png`, apple: `${assets}/apple-touch-icon.png` },
        ...(onOwnAddress && {
            manifest: `${assets}/manifest.webmanifest`,
            // iPhone and iPad: open from the home screen without Safari's bars, under a see-through status bar.
            appleWebApp: { capable: true, title, statusBarStyle: 'black-translucent' },
            // Older iPhones and iPads only know the Apple-named tag.
            other: { 'apple-mobile-web-app-capable': 'yes' },
        }),
    };
}
