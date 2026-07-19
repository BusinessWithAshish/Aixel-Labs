'use client';

import { useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import z from 'zod';
import { NumberControlledField, StringControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { createCoupon } from '@/app/actions/coupon-actions';
import { MAX_USER_CREDITS } from '@/helpers/credits';
import { toast } from 'sonner';

const createCouponSchema = z.object({
    code: z
        .string()
        .min(3, 'Code must be at least 3 characters')
        .max(64, 'Code must be at most 64 characters')
        .regex(/^[A-Za-z0-9_-]+$/, 'Only letters, numbers, hyphens, and underscores'),
    creditAmount: z.coerce
        .number({ invalid_type_error: 'Credits must be a number' })
        .int('Credits must be a whole number')
        .min(1, 'Credits must be at least 1')
        .max(MAX_USER_CREDITS, `Credits cannot exceed ${MAX_USER_CREDITS.toLocaleString()}`),
    maxRedemptions: z
        .string()
        .optional()
        .refine(
            (value) => {
                if (!value?.trim()) return true;
                const n = Number(value);
                return Number.isInteger(n) && n >= 1;
            },
            { message: 'Max uses must be a positive whole number' },
        ),
    expiresAt: z.string().optional(),
});

type CreateCouponFormValues = z.infer<typeof createCouponSchema>;

type CreateCouponDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
};

export function CreateCouponDialog({ open, onOpenChange, onSuccess }: CreateCouponDialogProps) {
    const form = useForm<CreateCouponFormValues>({
        resolver: zodResolver(createCouponSchema),
        defaultValues: {
            code: '',
            creditAmount: 100,
            maxRedemptions: '',
            expiresAt: '',
        },
    });

    const {
        handleSubmit,
        reset,
        formState: { isSubmitting },
    } = form;

    useEffect(() => {
        if (!open) {
            reset({
                code: '',
                creditAmount: 100,
                maxRedemptions: '',
                expiresAt: '',
            });
        }
    }, [open, reset]);

    const onSubmit = async (values: CreateCouponFormValues) => {
        const expiresAt = values.expiresAt?.trim() ? new Date(values.expiresAt).toISOString() : null;
        const maxRaw = values.maxRedemptions?.trim();
        const maxRedemptions = maxRaw ? Number(maxRaw) : null;

        const res = await createCoupon({
            code: values.code,
            creditAmount: values.creditAmount,
            maxRedemptions,
            expiresAt,
        });

        if (res.success && res.data) {
            toast.success(`Coupon ${res.data.code} created`);
            onSuccess?.();
            onOpenChange(false);
        } else {
            toast.error(res.error ?? 'Failed to create coupon');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Create coupon</DialogTitle>
                    <DialogDescription>
                        Users redeem this code for bonus credits on top of the tenant signup default.
                    </DialogDescription>
                </DialogHeader>

                <FormProvider {...form}>
                    <form id="create-coupon-form" className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
                        <StringControlledField name="code" label="Code" placeholder="WELCOME50" required />
                        <NumberControlledField name="creditAmount" label="Credits to grant" required />
                        <StringControlledField
                            name="maxRedemptions"
                            label="Max redemptions"
                            type="number"
                            description="Leave empty for unlimited uses."
                        />
                        <StringControlledField
                            name="expiresAt"
                            label="Expires at"
                            type="datetime-local"
                            description="Optional. Leave empty for no expiry."
                        />
                    </form>
                </FormProvider>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button type="submit" form="create-coupon-form" disabled={isSubmitting}>
                        {isSubmitting ? 'Creating…' : 'Create coupon'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
