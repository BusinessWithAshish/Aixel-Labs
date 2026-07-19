'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { GoogleAuthProvider, setPersistence, inMemoryPersistence, signInWithPopup, signOut } from 'firebase/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup } from '@/components/ui/field';
import { LegalAgreementNotice } from '@/components/common/LegalAgreementNotice';
import { createSession } from '@/app/actions/auth-actions';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { AUTH_ERROR_TOAST_DURATION_MS, AUTH_TOAST } from '@/lib/auth/constants';
import { getDeviceFingerprint } from '@/lib/auth/device-fingerprint';
import { mapGoogleSignInError, mapSessionCreateError, type AuthUserMessage } from '@/lib/auth/firebase-errors';

type LoginFormProps = React.ComponentProps<'div'> & {
    /** Safe post-login path resolved on the server. */
    callbackUrl: string;
};

function showError(message: AuthUserMessage) {
    toast.error(message.title, {
        description: message.description,
        duration: AUTH_ERROR_TOAST_DURATION_MS,
    });
}

export function LoginForm({ className, callbackUrl, ...props }: LoginFormProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = React.useState(false);

    async function handleGoogleSignIn() {
        setIsLoading(true);
        try {
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
