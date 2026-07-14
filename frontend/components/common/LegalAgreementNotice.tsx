import Link from 'next/link';
import { FieldDescription } from '@/components/ui/field';
import { cn } from '@/lib/utils';

type LegalAgreementNoticeProps = {
    className?: string;
};

export function LegalAgreementNotice({ className }: LegalAgreementNoticeProps) {
    return (
        <FieldDescription className={cn('text-balance', className)}>
            By clicking continue, you agree to our{' '}
            <Link href="/terms">Terms of Service</Link> and{' '}
            <Link href="/privacy">Privacy Policy</Link>.
        </FieldDescription>
    );
}
