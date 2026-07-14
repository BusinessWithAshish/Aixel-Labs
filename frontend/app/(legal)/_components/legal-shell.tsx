import Link from 'next/link';
import { AppLogo } from '@/components/common/AppLogo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { APP_NAME } from '@/config/app-config';
import { LEGAL } from '../_constants';
import { LegalBackButton } from './legal-back-button';

type LegalShellProps = {
    title: string;
    description: string;
    children: React.ReactNode;
};

export function LegalShell({ title, description, children }: LegalShellProps) {
    return (
        <main className="bg-background text-foreground mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-6 p-4 sm:p-6 md:p-10">
            <LegalBackButton />

            <header className="flex flex-wrap items-center justify-between gap-3">
                <Link href="/" className="flex items-center gap-2">
                    <AppLogo size={28} />
                    <span className="font-medium">{APP_NAME}</span>
                </Link>
                <nav className="flex gap-1">
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/terms">Terms</Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/privacy">Privacy</Link>
                    </Button>
                </nav>
            </header>

            <Card>
                <CardHeader>
                    <Badge variant="secondary">Last updated {LEGAL.lastUpdated}</Badge>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </CardHeader>
                <Separator />
                <CardContent className="space-y-6 pt-6">{children}</CardContent>
                <Separator />
                <CardFooter className="text-muted-foreground flex-col items-start gap-1 text-sm">
                    <p>
                        Email{' '}
                        <a href={`mailto:${LEGAL.contactEmail}`} className="text-primary underline-offset-4 hover:underline">
                            {LEGAL.contactEmail}
                        </a>
                    </p>
                    <p>
                        {LEGAL.companyName} · {LEGAL.contactAddress}
                    </p>
                </CardFooter>
            </Card>
        </main>
    );
}

type LegalSectionProps = {
    title: string;
    children: React.ReactNode;
};

export function LegalSection({ title, children }: LegalSectionProps) {
    return (
        <section className="space-y-2">
            <h2 className="leading-none font-semibold">{title}</h2>
            <div className="text-muted-foreground space-y-2 text-sm leading-relaxed">{children}</div>
        </section>
    );
}
