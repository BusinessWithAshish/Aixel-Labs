'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { useRouter, useSearchParams } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';
import * as z from 'zod';
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
import { DEFAULT_HOME_PAGE_ROUTE } from '@/config/app-config';
import { getFirebaseAuth } from '@/lib/firebase/client';

type Step = 'google' | 'phone' | 'otp';

const loginFormSchema = z.object({
    phoneNumber: z
        .string()
        .trim()
        .regex(/^\+[1-9]\d{7,14}$/, 'Enter a full number in E.164 format, e.g. +919876543210.'),
    otpCode: z.string().trim().length(6, 'Enter the 6-digit code from SMS.'),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

async function createServerSession(idToken: string): Promise<void> {
    const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
    });

    if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || 'Failed to create session');
    }
}

async function finishSignIn(user: User, callbackUrl: string, router: ReturnType<typeof useRouter>) {
    const idToken = await user.getIdToken(true);
    await createServerSession(idToken);
    await signOut(getFirebaseAuth());
    toast.success('Welcome!', { description: 'You have successfully signed in.' });
    router.push(callbackUrl);
    router.refresh();
}

export function LoginForm({ className, ...props }: React.ComponentProps<'div'>) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const callbackUrl = searchParams.get('callbackUrl') || DEFAULT_HOME_PAGE_ROUTE;

    const [step, setStep] = React.useState<Step>('google');
    const [isLoading, setIsLoading] = React.useState(false);
    const [confirmationResult, setConfirmationResult] = React.useState<ConfirmationResult | null>(null);

    const form = useForm<LoginFormValues>({
        resolver: zodResolver(loginFormSchema),
        defaultValues: {
            phoneNumber: '',
            otpCode: '',
        },
        mode: 'onSubmit',
    });

    const recaptchaContainerRef = React.useRef<HTMLDivElement>(null);
    const recaptchaVerifierRef = React.useRef<RecaptchaVerifier | null>(null);

    React.useEffect(() => {
        return () => {
            recaptchaVerifierRef.current?.clear();
            recaptchaVerifierRef.current = null;
        };
    }, []);

    function ensureRecaptcha(): RecaptchaVerifier {
        const auth = getFirebaseAuth();
        if (recaptchaVerifierRef.current) {
            return recaptchaVerifierRef.current;
        }
        const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
            size: 'invisible',
        });
        recaptchaVerifierRef.current = verifier;
        return verifier;
    }

    async function handleGoogleSignIn() {
        setIsLoading(true);
        try {
            const auth = getFirebaseAuth();
            await setPersistence(auth, inMemoryPersistence);

            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

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
        } finally {
            setIsLoading(false);
        }
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

        const phoneNumber = form.getValues('phoneNumber').trim();

        setIsLoading(true);
        try {
            const appVerifier = ensureRecaptcha();
            const confirmation = await linkWithPhoneNumber(user, phoneNumber, appVerifier);
            setConfirmationResult(confirmation);
            setStep('otp');
            toast.success('Code sent', { description: 'Enter the SMS verification code.' });
        } catch (error: unknown) {
            recaptchaVerifierRef.current?.clear();
            recaptchaVerifierRef.current = null;
            const message = error instanceof Error ? error.message : 'Failed to send verification code';
            toast.error('Phone verification failed', { description: message });
        } finally {
            setIsLoading(false);
        }
    }

    async function handleConfirmOtp() {
        if (!confirmationResult) {
            toast.error('No verification in progress', { description: 'Request a new code.' });
            setStep('phone');
            return;
        }

        const isValid = await form.trigger('otpCode');
        if (!isValid) return;

        const otpCode = form.getValues('otpCode').trim();

        setIsLoading(true);
        try {
            const result = await confirmationResult.confirm(otpCode);
            await finishSignIn(result.user, callbackUrl, router);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Invalid verification code';
            toast.error('Verification failed', { description: message });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <FormProvider {...form}>
            <div className={cn('flex w-full flex-col gap-6', className)} {...props}>
                <FieldGroup>
                    <div className="flex flex-col items-center gap-2 text-center">
                        <h1 className="text-2xl font-bold">Sign in to your account</h1>
                        <p className="text-muted-foreground text-balance text-sm">
                            {step === 'google' && 'Continue with Google, then verify your phone number.'}
                            {step === 'phone' && 'Enter your phone number to receive a verification code.'}
                            {step === 'otp' && 'Enter the code we sent to your phone.'}
                        </p>
                    </div>

                    {step === 'google' && (
                        <Field>
                            <Button
                                type="button"
                                disabled={isLoading}
                                className="w-full"
                                onClick={handleGoogleSignIn}
                            >
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
                                <Button
                                    type="button"
                                    disabled={isLoading}
                                    className="w-full"
                                    onClick={handleSendOtp}
                                >
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

                {/* Invisible reCAPTCHA mount point for Firebase phone auth */}
                <div id="recaptcha-container" ref={recaptchaContainerRef} />
            </div>
        </FormProvider>
    );
}

