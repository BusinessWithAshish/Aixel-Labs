import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { PATHNAME_HEADER_KEY, PRODUCT_TENANTS_ROUTE_PREFIX } from '@/config/app-config';
import { Baloo_2, Nunito, Teko } from 'next/font/google';
import { BusinessConfigProvider } from './_components/BusinessConfig';
import { serverBusinessWsUrl } from './_lib/client';
import './business.css';

const display = Baloo_2({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--bb-display' });
const body = Nunito({ subsets: ['latin'], weight: ['500', '700', '800'], variable: '--bb-body' });
const numbers = Teko({ subsets: ['latin'], weight: ['600', '700'], variable: '--bb-num' });

const ICONS = '/business';

/**
 * The game can be put on a phone's home screen as its own app. That is only offered on the game's
 * own address (business.…), where "/" is the game: there the middleware passes on a path that does
 * not start with `/products`. Under the main site's `/products/business` the same manifest would
 * install the whole site, so it is left out.
 */
export async function generateMetadata(): Promise<Metadata> {
    const onOwnAddress = !((await headers()).get(PATHNAME_HEADER_KEY) ?? PRODUCT_TENANTS_ROUTE_PREFIX).startsWith(PRODUCT_TENANTS_ROUTE_PREFIX);
    return {
        title: 'Big Business',
        description: 'A property-trading board game you play with friends in a private room.',
        icons: { icon: `${ICONS}/icon-192.png`, apple: `${ICONS}/apple-touch-icon.png` },
        ...(onOwnAddress && {
            manifest: `${ICONS}/manifest.webmanifest`,
            // iPhone and iPad: open from the home screen without Safari's bars, under a see-through status bar.
            appleWebApp: { capable: true, title: 'Big Business', statusBarStyle: 'black-translucent' },
            // Older iPhones and iPads only know the Apple-named tag.
            other: { 'apple-mobile-web-app-capable': 'yes' },
        }),
    };
}

/** `viewportFit: cover` lets the game reach under the notch; business.css keeps its content clear of it. */
export const viewport: Viewport = { themeColor: '#120A2E', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className={`bb ${display.variable} ${body.variable} ${numbers.variable}`}>
            <BusinessConfigProvider wsUrl={serverBusinessWsUrl()}>{children}</BusinessConfigProvider>
        </div>
    );
}
