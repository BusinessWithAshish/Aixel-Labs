import type { ContentLabPlatform } from '@aixellabs/backend/content-lab/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { PlatformIcon } from './PlatformIcon';

type CreatorAvatarProps = {
    name: string | null | undefined;
    handle: string | null | undefined;
    avatarUrl: string | null | undefined;
    /** Shows the platform's logo on the picture's corner. */
    platform?: ContentLabPlatform;
    className?: string;
};

const initials = (text: string) =>
    text
        .replace(/^@+/, '')
        .split(/[\s._-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]!.toUpperCase())
        .join('') || '?';

/**
 * A creator's (or the user's own) profile picture, straight from the platform CDN (`no-referrer`, as
 * lead cards load Instagram images), with initials while it loads or when there is none.
 */
export function CreatorAvatar({ name, handle, avatarUrl, platform, className }: CreatorAvatarProps) {
    return (
        <span className={cn('relative inline-flex size-12 shrink-0', className)}>
            <Avatar className="size-full border">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" className="object-cover" /> : null}
                <AvatarFallback className="text-sm font-semibold">{initials(name || handle || '')}</AvatarFallback>
            </Avatar>
            {platform ? (
                <span className="bg-background absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full border shadow-sm">
                    <PlatformIcon platform={platform} className="size-3" />
                </span>
            ) : null}
        </span>
    );
}
