import Link from 'next/link';
import { FieldDescription } from '@/components/ui/field';
import { cn } from '@/lib/utils';

type LegalAgreementNoticeProps = {
    className?: string;
    /** `continue` for sign-in CTAs; `account` for account settings. */
    variant?: 'continue' | 'account';
};

function LegalLinks() {
    return (
        <>
            <Link href="/terms">Terms of Service</Link> and{' '}
            <Link href="/privacy">Privacy Policy</Link>
        </>
    );
}

export function LegalAgreementNotice({ className, variant = 'continue' }: LegalAgreementNoticeProps) {
    return (
        <FieldDescription className={cn('text-balance', className)}>
            {variant === 'account' ? (
                <>
                    Your use of this application is governed by our <LegalLinks />.
                </>
            ) : (
                <>
                    By clicking continue, you agree to our <LegalLinks />.
                </>
            )}
        </FieldDescription>
    );
}
