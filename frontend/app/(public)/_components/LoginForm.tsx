'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, type ControllerRenderProps, type FieldError as RHFFieldError } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getTenantCurrentByUrl } from '@/helpers/get-current-tenant-by-url';
import { DEFAULT_HOME_PAGE_ROUTE } from '@/config/app-config';

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

export function LoginForm({ className, ...props }: React.ComponentProps<'form'>) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const callbackUrl = searchParams.get('callbackUrl') || DEFAULT_HOME_PAGE_ROUTE;
    const [isLoading, setIsLoading] = React.useState(false);

    const form = useForm<FormSchema>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: '',
            password: '',
            name: '',
        },
    });

    async function onSubmit(data: FormSchema) {
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
                    toast.error('Sign in failed', {
                        description: 'Invalid credentials. Please check your email and password.',
                    });
                } else {
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
        <form className={cn('flex flex-col gap-6', className)} onSubmit={form.handleSubmit(onSubmit)} {...props}>
            <FieldGroup>
                <div className="flex flex-col items-center gap-2 text-center">
                    <h1 className="text-2xl font-bold">Login to your account</h1>
                    <p className="text-muted-foreground text-balance text-sm">
                        Enter your email below to login to your account
                    </p>
                </div>
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
                                required
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
                                required
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
                            <FieldDescription>This field is optional and only used for display purposes.</FieldDescription>
                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                        </Field>
                    )}
                />
                <Field>
                    <Button type="submit" disabled={isLoading} className="w-full">
                        {isLoading ? 'Signing in...' : 'Sign In'}
                    </Button>
                </Field>
            </FieldGroup>
        </form>
    );
}

