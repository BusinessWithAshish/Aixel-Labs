import type { Metadata, Viewport } from 'next';
import { Baloo_2, Nunito, Teko } from 'next/font/google';
import { BusinessConfigProvider } from './_components/BusinessConfig';
import { serverBusinessWsUrl } from './_lib/client';
import './business.css';

const display = Baloo_2({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--bb-display' });
const body = Nunito({ subsets: ['latin'], weight: ['500', '700', '800'], variable: '--bb-body' });
const numbers = Teko({ subsets: ['latin'], weight: ['600', '700'], variable: '--bb-num' });

export const metadata: Metadata = {
    title: 'Big Business',
    description: 'A property-trading board game you play with friends in a private room.',
};

export const viewport: Viewport = { themeColor: '#120A2E', width: 'device-width', initialScale: 1 };

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className={`bb ${display.variable} ${body.variable} ${numbers.variable}`}>
            <BusinessConfigProvider wsUrl={serverBusinessWsUrl()}>{children}</BusinessConfigProvider>
        </div>
    );
}
