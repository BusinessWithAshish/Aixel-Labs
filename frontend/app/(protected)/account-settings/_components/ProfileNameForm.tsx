'use client';

import { useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { StringControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { updateCurrentUserName } from '@/app/actions/user-actions';
import { USER_NAME_MAX_LENGTH, userNameSchema } from '@/helpers/user-name';

const profileNameFormSchema = z.object({
    name: userNameSchema,
});

type ProfileNameFormData = z.infer<typeof profileNameFormSchema>;

type ProfileNameFormProps = {
    initialName: string;
    email: string;
};

export function ProfileNameForm({ initialName, email }: ProfileNameFormProps) {
    const router = useRouter();
    const form = useForm<ProfileNameFormData>({
        resolver: zodResolver(profileNameFormSchema),
        defaultValues: { name: initialName },
    });

    const { handleSubmit, reset, formState: { isSubmitting, isDirty } } = form;

    useEffect(() => {
        reset({ name: initialName });
    }, [initialName, reset]);

    const onSubmit = async (data: ProfileNameFormData) => {
        try {
            const result = await updateCurrentUserName(data.name);
            if (!result.success) {
                throw new Error(result.error || 'Failed to update name');
            }
            const savedName = result.data?.name ?? data.name;
            toast.success('Name updated');
            reset({ name: savedName });
            router.refresh();
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Failed to update name';
            toast.error(msg);
            console.error('Update name error:', error);
        }
    };

    return (
        <FormProvider {...form}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <StringControlledField
                    name="name"
                    label="Display name"
                    placeholder="Enter your name"
                    description={`Letters and numbers only, with at most one space. Max ${USER_NAME_MAX_LENGTH} characters.`}
                    required
                />
                <div className="space-y-1.5">
                    <p className="text-sm font-medium">Email</p>
                    <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{email}</p>
                    <p className="text-xs text-muted-foreground">Email cannot be changed here.</p>
                </div>
                <Button type="submit" disabled={isSubmitting || !isDirty}>
                    {isSubmitting ? 'Saving...' : 'Save name'}
                </Button>
            </form>
        </FormProvider>
    );
}
