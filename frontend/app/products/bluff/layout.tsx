import type { Metadata, Viewport } from 'next';
import { Baloo_2, Nunito, Teko } from 'next/font/google';
import { BusinessConfigProvider } from '../business/_components/BusinessConfig';
import { serverBluffWsUrl } from './_lib/client';
// The whole skin is Big Business's; bluff.css adds only the card table.
import '../business/business.css';
import './bluff.css';

const display = Baloo_2({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--bb-display' });
const body = Nunito({ subsets: ['latin'], weight: ['500', '700', '800'], variable: '--bb-body' });
const numbers = Teko({ subsets: ['latin'], weight: ['600', '700'], variable: '--bb-num' });

export const metadata: Metadata = {
    title: 'Bluff',
    description: 'The card game of lies and calls. Play with friends in a private room.',
};

export const viewport: Viewport = { themeColor: '#120A2E', width: 'device-width', initialScale: 1 };

export default function BluffLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className={`bb bl ${display.variable} ${body.variable} ${numbers.variable}`}>
            {/* The provider only carries the socket address and starts the audio; it holds nothing of Big Business's rules. */}
            <BusinessConfigProvider wsUrl={serverBluffWsUrl()}>{children}</BusinessConfigProvider>
        </div>
    );
}
