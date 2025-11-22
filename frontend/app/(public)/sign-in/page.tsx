'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, type ControllerRenderProps, type FieldError as RHFFieldError } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { FieldGroup, Field, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getTenantCurrentByUrl } from '@/helpers/get-current-tenant-by-url';

const formSchema = z.object({
    email: z
        .string()
        .min(1, 'Email is required.')
        .email('Please enter a valid email address.')
        .transform((val) => val.trim().toLowerCase()),
    password: z.string().min(6, 'Password must be at least 6 characters.'),
    name: z
        .string()
        .optional()
        .transform((val) => (val ? val.trim() : val)),
});

type FormSchema = z.infer<typeof formSchema>;

export default function SignInPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const callbackUrl = searchParams.get('callbackUrl') || '/';
    const [isLoading, setIsLoading] = React.useState(false);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: '',
            password: '',
            name: '',
        },
    });

    async function onSubmit(data: z.infer<typeof formSchema>) {
        setIsLoading(true);
        try {
            // Get tenantId from subdomain
            const rawTenantId = getTenantCurrentByUrl();

            if (!rawTenantId) {
                toast.error('Tenant not found', {
                    description: 'Unable to determine tenant from URL. Please access from the correct subdomain.',
                });
                setIsLoading(false);
                return;
            }

            // Normalize tenantId to lowercase for database comparison
            const tenantId = rawTenantId.toLowerCase().trim();

            const result = await signIn('credentials', {
                email: data.email,
                password: data.password,
                tenantId: tenantId,
                redirect: false,
            });

            if (result?.error) {
                // Handle specific error messages from NextAuth
                // NextAuth passes the error code in the error field
                const errorType = result.error;

                // Handle specific custom error codes
                if (errorType === 'USER_NOT_FOUND') {
                    toast.error('User not found', {
                        description: 'You are not part of this app yet. Please contact hello@aixellabs.com for support.',
                        duration: 6000,
                    });
                } else if (errorType === 'USER_NOT_IN_TENANT') {
                    toast.error('Access denied', {
                        description:
                            'Your account is not associated with this organization. Please contact hello@aixellabs.com for support.',
                        duration: 6000,
                    });
                } else if (errorType === 'INVALID_PASSWORD') {
                    toast.error('Incorrect password', {
                        description: 'The password you entered is incorrect. Please try again.',
                    });
                } else if (errorType === 'INVALID_CREDENTIALS') {
                    toast.error('Invalid input', {
                        description: 'Please check your email and password format.',
                    });
                } else if (errorType === 'CredentialsSignin') {
                    // Generic NextAuth error (fallback)
                    toast.error('Sign in failed', {
                        description: 'Invalid credentials. Please check your email and password.',
                    });
                } else {
                    // Catch-all for any other errors
                    toast.error('Sign in failed', {
                        description: 'An error occurred during sign in. Please try again.',
                    });
                }
            } else if (result?.ok) {
                toast.success('Welcome back!', {
                    description: 'You have successfully signed in.',
                });
                router.push(callbackUrl);
                router.refresh();
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.';
            toast.error('Something went wrong', {
                description: errorMessage,
            });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="flex flex-col h-full p-8 mx-auto items-center justify-center">
            <Card className="w-full h-fit max-w-md">
                <CardHeader className="text-center">
                    <CardTitle className="text-xl">Welcome back</CardTitle>
                    <CardDescription>Sign in to your account to continue</CardDescription>
                </CardHeader>
                <CardContent>
                    <form id="sign-in-form" onSubmit={form.handleSubmit(onSubmit)}>
                        <FieldGroup>
                            <Controller
                                name="email"
                                control={form.control}
                                render={({
                                    field,
                                    fieldState,
                                }: {
                                    field: ControllerRenderProps<FormSchema, 'email'>;
                                    fieldState: { invalid: boolean; error?: RHFFieldError };
                                }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel htmlFor="sign-in-email">Email</FieldLabel>
                                        <Input
                                            {...field}
                                            id="sign-in-email"
                                            type="email"
                                            aria-invalid={fieldState.invalid}
                                            placeholder="m@example.com"
                                            autoComplete="email"
                                            disabled={isLoading}
                                        />
                                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                    </Field>
                                )}
                            />
                            <Controller
                                name="password"
                                control={form.control}
                                render={({
                                    field,
                                    fieldState,
                                }: {
                                    field: ControllerRenderProps<FormSchema, 'password'>;
                                    fieldState: { invalid: boolean; error?: RHFFieldError };
                                }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel htmlFor="sign-in-password">Password</FieldLabel>
                                        <Input
                                            {...field}
                                            id="sign-in-password"
                                            type="password"
                                            aria-invalid={fieldState.invalid}
                                            placeholder="Enter your password"
                                            autoComplete="current-password"
                                            disabled={isLoading}
                                        />
                                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                    </Field>
                                )}
                            />
                            <Controller
                                name="name"
                                control={form.control}
                                render={({
                                    field,
                                    fieldState,
                                }: {
                                    field: ControllerRenderProps<FormSchema, 'name'>;
                                    fieldState: { invalid: boolean; error?: RHFFieldError };
                                }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel htmlFor="sign-in-name">
                                            Name <span className="text-muted-foreground text-xs">(optional)</span>
                                        </FieldLabel>
                                        <Input
                                            {...field}
                                            id="sign-in-name"
                                            type="text"
                                            aria-invalid={fieldState.invalid}
                                            placeholder="Your name"
                                            autoComplete="name"
                                            disabled={isLoading}
                                        />
                                        <FieldDescription>
                                            This field is optional and only used for display purposes.
                                        </FieldDescription>
                                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                    </Field>
                                )}
                            />
                        </FieldGroup>
                    </form>
                </CardContent>
                <CardFooter>
                    <Button type="submit" form="sign-in-form" disabled={isLoading} className="w-full">
                        {isLoading ? 'Signing in...' : 'Sign In'}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
