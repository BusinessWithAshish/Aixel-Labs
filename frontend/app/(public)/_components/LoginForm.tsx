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
import { AUTH_ERROR_TOAST_DURATION_MS, AUTH_TOAST } from '@/lib/auth/constants';
import {
    mapGoogleSignInError,
    mapOtpConfirmError,
    mapPhoneLinkError,
    mapSessionCreateError,
    type AuthUserMessage,
} from '@/lib/auth/firebase-errors';
import { loginFormSchema, type LoginFormValues } from '@/lib/auth/login-schema';

type Step = 'google' | 'phone' | 'otp';

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

async function finishSignIn(user: User, callbackUrl: string, router: ReturnType<typeof useRouter>) {
    const idToken = await user.getIdToken(true);
    const result = await createSession(idToken);
    if (!result.success) {
        throw new Error(result.error);
    }
    await signOut(getFirebaseAuth());
    toast.success(AUTH_TOAST.WELCOME, { description: 'You have successfully signed in.' });
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
                    try {
                        await finishSignIn(user, callbackUrl, router);
                    } catch (error: unknown) {
                        showError(mapSessionCreateError(error));
                    }
                    return;
                }

                setStep('phone');
                toast.message(AUTH_TOAST.VERIFY_PHONE, {
                    description: 'Link a phone number to finish signing in.',
                });
            } catch (error: unknown) {
                showError(mapGoogleSignInError(error));
            }
        });
    }

    async function handleSendOtp() {
        const auth = getFirebaseAuth();
        const user = auth.currentUser;
        if (!user) {
            toast.error(AUTH_TOAST.SESSION_EXPIRED, {
                description: 'Please sign in with Google again.',
                duration: AUTH_ERROR_TOAST_DURATION_MS,
            });
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
                toast.success(AUTH_TOAST.CODE_SENT, {
                    description: 'Enter the SMS verification code.',
                });
            } catch (error: unknown) {
                recaptchaVerifierRef.current?.clear();
                recaptchaVerifierRef.current = null;
                showError(mapPhoneLinkError(error));
            }
        });
    }

    async function handleConfirmOtp() {
        if (!confirmationResult) {
            toast.error(AUTH_TOAST.NO_OTP, {
                description: 'Request a new code.',
                duration: AUTH_ERROR_TOAST_DURATION_MS,
            });
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
                // OTP confirm vs session create: prefer Firebase OTP mapping when code is present,
                // otherwise session/Mongo messages from createSession.
                const code =
                    error && typeof error === 'object' && 'code' in error
                        ? String((error as { code: unknown }).code)
                        : undefined;
                showError(code?.startsWith('auth/') ? mapOtpConfirmError(error) : mapSessionCreateError(error));
            }
        });
    }

    return (
        <FormProvider {...form}>
            <div className={cn('flex w-full flex-col gap-6', className)} {...props}>
                <FieldGroup>
                    <div className="flex flex-col gap-2 items-center text-center">
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
