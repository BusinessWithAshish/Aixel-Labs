'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UserAvatar } from '@/components/common/UserAvatar';
import { updateCurrentUserAvatar } from '@/app/actions/user-actions';
import { AVATAR_SIZE_PX, AVATAR_UPLOAD_MAX_BYTES, AVATAR_UPLOAD_TYPES } from '@/helpers/user-avatar';

type ProfilePhotoFormProps = {
    name: string;
    email: string;
    avatar?: string;
};

/** Decodes the file and redraws it as a square JPEG: a corrupt file fails to decode, and nothing but pixels survives. */
async function toAvatarDataUrl(file: File): Promise<string> {
    const bitmap = await createImageBitmap(file).catch(() => {
        throw new Error('That file is not a valid image');
    });
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE_PX;
    canvas.height = AVATAR_SIZE_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process the image');
    ctx.fillStyle = '#fff'; // JPEG has no transparency
    ctx.fillRect(0, 0, AVATAR_SIZE_PX, AVATAR_SIZE_PX);
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE_PX, AVATAR_SIZE_PX);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.85);
}

export function ProfilePhotoForm({ name, email, avatar }: ProfilePhotoFormProps) {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const [isSaving, setIsSaving] = useState(false);

    const save = async (next: string | null, successMessage: string) => {
        setIsSaving(true);
        try {
            const result = await updateCurrentUserAvatar(next);
            if (!result.success) {
                throw new Error(result.error || 'Failed to update photo');
            }
            toast.success(successMessage);
            router.refresh();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to update photo');
            console.error('Update photo error:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (!(AVATAR_UPLOAD_TYPES as readonly string[]).includes(file.type)) {
            toast.error('Choose a JPG, PNG or WebP image');
            return;
        }
        if (file.size > AVATAR_UPLOAD_MAX_BYTES) {
            toast.error('Image must be 5 MB or smaller');
            return;
        }
        try {
            await save(await toAvatarDataUrl(file), 'Photo updated');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not process the image');
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Profile photo</CardTitle>
                <CardDescription>JPG, PNG or WebP, up to 5 MB. It is cropped to a square.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-4">
                <UserAvatar name={name} colorSeed={email} avatar={avatar} className="h-16 w-16 rounded-full text-2xl" />
                <input
                    ref={inputRef}
                    type="file"
                    accept={AVATAR_UPLOAD_TYPES.join(',')}
                    className="hidden"
                    onChange={onFileChange}
                    aria-label="Upload profile photo"
                />
                <div className="flex gap-2">
                    <Button type="button" onClick={() => inputRef.current?.click()} disabled={isSaving}>
                        {isSaving ? 'Saving...' : avatar ? 'Change photo' : 'Upload photo'}
                    </Button>
                    {avatar && (
                        <Button type="button" variant="outline" onClick={() => save(null, 'Photo removed')} disabled={isSaving}>
                            Remove
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
