'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';
import {
    GoogleAuthProvider,
    linkWithPhoneNumber,
    setPersistence,
    inMemoryPersistence,
    signInWithPopup,
    signOut,
    type ConfirmationResult,
    RecaptchaVerifier,
    type User,
} from 'firebase/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup } from '@/components/ui/field';
import { StringControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { createSession } from '@/app/actions/auth-actions';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { loginFormSchema, type LoginFormValues } from '@/lib/auth/login-schema';

type Step = 'google' | 'phone' | 'otp';

type LoginFormProps = React.ComponentProps<'div'> & {
    /** Safe post-login path resolved on the server. */
    callbackUrl: string;
};

async function finishSignIn(user: User, callbackUrl: string, router: ReturnType<typeof useRouter>) {
    const idToken = await user.getIdToken(true);
    const result = await createSession(idToken);
    if (!result.success) {
        throw new Error(result.error);
    }
    await signOut(getFirebaseAuth());
    toast.success('Welcome!', { description: 'You have successfully signed in.' });
    router.push(callbackUrl);
    router.refresh();
}

function stepCopy(step: Step): string {
    switch (step) {
        case 'google':
            return 'Continue with Google, then verify your phone number.';
        case 'phone':
            return 'Enter your phone number to receive a verification code.';
        case 'otp':
            return 'Enter the code we sent to your phone.';
    }
}

export function LoginForm({ className, callbackUrl, ...props }: LoginFormProps) {
    const router = useRouter();
    const [step, setStep] = React.useState<Step>('google');
    const [isLoading, setIsLoading] = React.useState(false);
    const [confirmationResult, setConfirmationResult] = React.useState<ConfirmationResult | null>(null);
    const recaptchaVerifierRef = React.useRef<RecaptchaVerifier | null>(null);

    const form = useForm<LoginFormValues>({
        resolver: zodResolver(loginFormSchema),
        defaultValues: { phoneNumber: '', otpCode: '' },
        mode: 'onSubmit',
    });

    React.useEffect(() => {
        return () => {
            recaptchaVerifierRef.current?.clear();
            recaptchaVerifierRef.current = null;
        };
    }, []);

    function ensureRecaptcha(): RecaptchaVerifier {
        if (recaptchaVerifierRef.current) return recaptchaVerifierRef.current;
        const verifier = new RecaptchaVerifier(getFirebaseAuth(), 'recaptcha-container', { size: 'invisible' });
        recaptchaVerifierRef.current = verifier;
        return verifier;
    }

    async function withLoading(action: () => Promise<void>) {
        setIsLoading(true);
        try {
            await action();
        } finally {
            setIsLoading(false);
        }
    }

    async function handleGoogleSignIn() {
        await withLoading(async () => {
            try {
                const auth = getFirebaseAuth();
                await setPersistence(auth, inMemoryPersistence);
                const { user } = await signInWithPopup(auth, new GoogleAuthProvider());

                if (user.phoneNumber) {
                    await finishSignIn(user, callbackUrl, router);
                    return;
                }

                setStep('phone');
                toast.message('Verify your phone', {
                    description: 'Link a phone number to finish signing in.',
                });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Google sign-in failed';
                toast.error('Sign in failed', { description: message });
            }
        });
    }

    async function handleSendOtp() {
        const auth = getFirebaseAuth();
        const user = auth.currentUser;
        if (!user) {
            toast.error('Session expired', { description: 'Please sign in with Google again.' });
            setStep('google');
            return;
        }

        const isValid = await form.trigger('phoneNumber');
        if (!isValid) return;

        await withLoading(async () => {
            try {
                const confirmation = await linkWithPhoneNumber(
                    user,
                    form.getValues('phoneNumber').trim(),
                    ensureRecaptcha(),
                );
                setConfirmationResult(confirmation);
                setStep('otp');
                toast.success('Code sent', { description: 'Enter the SMS verification code.' });
            } catch (error: unknown) {
                recaptchaVerifierRef.current?.clear();
                recaptchaVerifierRef.current = null;
                const message = error instanceof Error ? error.message : 'Failed to send verification code';
                toast.error('Phone verification failed', { description: message });
            }
        });
    }

    async function handleConfirmOtp() {
        if (!confirmationResult) {
            toast.error('No verification in progress', { description: 'Request a new code.' });
            setStep('phone');
            return;
        }

        const isValid = await form.trigger('otpCode');
        if (!isValid) return;

        await withLoading(async () => {
            try {
                const { user } = await confirmationResult.confirm(form.getValues('otpCode').trim());
                await finishSignIn(user, callbackUrl, router);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Invalid verification code';
                toast.error('Verification failed', { description: message });
            }
        });
    }

    return (
        <FormProvider {...form}>
            <div className={cn('flex w-full flex-col gap-6', className)} {...props}>
                <FieldGroup>
                    <div className="flex flex-col items-center gap-2 text-center">
                        <h1 className="text-2xl font-bold">Sign in to your account</h1>
                        <p className="text-muted-foreground text-balance text-sm">{stepCopy(step)}</p>
                    </div>

                    {step === 'google' && (
                        <Field>
                            <Button
                                type="button"
                                disabled={isLoading}
                                className="w-full gap-2"
                                onClick={handleGoogleSignIn}
                            >
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
                    )}

                    {step === 'phone' && (
                        <>
                            <StringControlledField
                                name="phoneNumber"
                                label="Phone number"
                                type="tel"
                                required
                                disabled={isLoading}
                                placeholder="+919876543210"
                                description="Use international format starting with +"
                            />
                            <Field>
                                <Button type="button" disabled={isLoading} className="w-full" onClick={handleSendOtp}>
                                    {isLoading ? 'Sending code...' : 'Send verification code'}
                                </Button>
                            </Field>
                        </>
                    )}

                    {step === 'otp' && (
                        <>
                            <StringControlledField
                                name="otpCode"
                                label="Verification code"
                                type="text"
                                required
                                disabled={isLoading}
                                placeholder="123456"
                            />
                            <Field>
                                <Button
                                    type="button"
                                    disabled={isLoading}
                                    className="w-full"
                                    onClick={handleConfirmOtp}
                                >
                                    {isLoading ? 'Verifying...' : 'Verify and continue'}
                                </Button>
                            </Field>
                            <Button
                                type="button"
                                variant="ghost"
                                disabled={isLoading}
                                className="w-full"
                                onClick={() => {
                                    form.setValue('otpCode', '');
                                    form.clearErrors('otpCode');
                                    setConfirmationResult(null);
                                    setStep('phone');
                                }}
                            >
                                Use a different number
                            </Button>
                        </>
                    )}
                </FieldGroup>

                <div id="recaptcha-container" />
            </div>
        </FormProvider>
    );
}
