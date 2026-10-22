import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { avatarColor, avatarInitial } from '@/helpers/user-avatar';
import { cn } from '@/lib/utils';

type UserAvatarProps = {
    name: string;
    /** Seeds the fallback colour; pass something stable like the email. */
    colorSeed: string;
    avatar?: string;
    className?: string;
};

/** Profile photo, or the first letter of the name on a solid per-user colour when there is none. */
export function UserAvatar({ name, colorSeed, avatar, className }: UserAvatarProps) {
    return (
        <Avatar className={cn('h-8 w-8 rounded-lg', className)}>
            {avatar && <AvatarImage src={avatar} alt={name} className="object-cover" />}
            <AvatarFallback
                className="rounded-[inherit] font-medium text-white"
                style={{ backgroundColor: avatarColor(colorSeed) }}
            >
                {avatarInitial(name)}
            </AvatarFallback>
        </Avatar>
    );
}
