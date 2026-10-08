import type { Metadata, Viewport } from 'next';
import { Baloo_2, Nunito, Teko } from 'next/font/google';
import { installMetadata } from '../_lib/install-metadata';
import { BusinessConfigProvider } from './_components/BusinessConfig';
import { serverBusinessWsUrl } from './_lib/client';
import './business.css';

const display = Baloo_2({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--bb-display' });
const body = Nunito({ subsets: ['latin'], weight: ['500', '700', '800'], variable: '--bb-body' });
const numbers = Teko({ subsets: ['latin'], weight: ['600', '700'], variable: '--bb-num' });

/** Installable as its own app from the game's own address: see `installMetadata`. */
export async function generateMetadata(): Promise<Metadata> {
    return {
        title: 'Big Business',
        description: 'A property-trading board game you play with friends in a private room.',
        ...(await installMetadata('/business', 'Big Business')),
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
