'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { GoogleAuthProvider, setPersistence, inMemoryPersistence, signInWithPopup, signOut } from 'firebase/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { LegalAgreementNotice } from '@/components/common/LegalAgreementNotice';
import { createSession } from '@/app/actions/auth-actions';
import { redeemCoupon } from '@/app/actions/coupon-actions';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { AUTH_ERROR_TOAST_DURATION_MS, AUTH_TOAST } from '@/lib/auth/constants';
import { getDeviceFingerprint } from '@/lib/auth/device-fingerprint';
import { mapGoogleSignInError, mapSessionCreateError, type AuthUserMessage } from '@/lib/auth/firebase-errors';
import {
    clearPendingCouponCode,
    readPendingCouponCode,
    storePendingCouponCode,
} from '@/lib/auth/pending-coupon';

type LoginFormProps = React.ComponentProps<'div'> & {
    /** Safe post-login path resolved on the server. */
    callbackUrl: string;
    /** Optional coupon from `?coupon=` on the sign-in URL. */
    initialCouponCode?: string;
};

function showError(message: AuthUserMessage) {
    toast.error(message.title, {
        description: message.description,
        duration: AUTH_ERROR_TOAST_DURATION_MS,
    });
}

async function tryRedeemPendingCoupon() {
    const pending = readPendingCouponCode();
    if (!pending) return;

    clearPendingCouponCode();
    const res = await redeemCoupon(pending);
    if (res.success && res.data) {
        toast.success(`Coupon applied: +${res.data.creditAmount.toLocaleString()} credits`);
        return;
    }

    // Already redeemed / invalid / admin — one soft toast; signup still succeeded.
    if (res.error && !/already redeemed/i.test(res.error)) {
        toast.message('Coupon not applied', { description: res.error });
    }
}

export function LoginForm({ className, callbackUrl, initialCouponCode = '', ...props }: LoginFormProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = React.useState(false);
    const [couponCode, setCouponCode] = React.useState(initialCouponCode);

    React.useEffect(() => {
        if (initialCouponCode.trim()) {
            storePendingCouponCode(initialCouponCode);
        }
    }, [initialCouponCode]);

    async function handleGoogleSignIn() {
        setIsLoading(true);
        try {
            if (couponCode.trim()) {
                storePendingCouponCode(couponCode);
            }

            const auth = getFirebaseAuth();
            await setPersistence(auth, inMemoryPersistence);
            const { user } = await signInWithPopup(auth, new GoogleAuthProvider());

            const deviceFingerprint = await getDeviceFingerprint();
            const idToken = await user.getIdToken(true);
            const result = await createSession(idToken, deviceFingerprint);
            if (!result.success) {
                throw new Error(result.error);
            }

            await signOut(auth);
            toast.success(AUTH_TOAST.WELCOME, { description: 'You have successfully signed in.' });
            await tryRedeemPendingCoupon();
            router.push(callbackUrl);
            router.refresh();
        } catch (error: unknown) {
            const code =
                error && typeof error === 'object' && 'code' in error
                    ? String((error as { code: unknown }).code)
                    : undefined;
            showError(code?.startsWith('auth/') ? mapGoogleSignInError(error) : mapSessionCreateError(error));
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className={cn('flex w-full flex-col gap-6', className)} {...props}>
            <FieldGroup>
                <div className="flex flex-col gap-2 items-center text-center">
                    <h1 className="text-2xl font-bold">Sign in to your account</h1>
                    <p className="text-muted-foreground text-balance text-sm">Continue with Google to sign in.</p>
                </div>

                <Field>
                    <FieldLabel htmlFor="login-coupon-code">Coupon code (optional)</FieldLabel>
                    <Input
                        id="login-coupon-code"
                        value={couponCode}
                        onChange={(event) => setCouponCode(event.target.value)}
                        placeholder="WELCOME50"
                        autoComplete="off"
                        disabled={isLoading}
                        className="font-mono uppercase"
                    />
                    <p className="text-xs text-muted-foreground">
                        Have a bonus code? Enter it here or redeem later in Account settings.
                    </p>
                </Field>

                <Field>
                    <Button type="button" disabled={isLoading} className="w-full gap-2" onClick={handleGoogleSignIn}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/google-logo.png"
                            alt=""
                            width={18}
                            height={18}
                            className="size-[18px] shrink-0"
                            aria-hidden
                        />
                        {isLoading ? 'Signing in...' : 'Continue with Google'}
                    </Button>
                </Field>
            </FieldGroup>

            <LegalAgreementNotice className="text-center" />
        </div>
    );
}
