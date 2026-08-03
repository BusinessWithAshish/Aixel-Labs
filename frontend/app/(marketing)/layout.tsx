import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Aixel Labs · Lead management + AI automation',
    description:
        'Find, enrich, and act on leads across Maps, search, and social with a lead-management platform, plus a done-for-you AI automation consultancy.',
    openGraph: {
        title: 'Aixel Labs · Lead management + AI automation',
        description:
            'Find, enrich, and act on leads across Maps, search, and social with a lead-management platform, plus a done-for-you AI automation consultancy.',
        siteName: 'Aixel Labs',
    },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-dvh w-full bg-background text-foreground antialiased">
            {children}
        </div>
    );
}
