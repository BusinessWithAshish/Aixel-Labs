import { Instagram, Linkedin, Youtube, type LucideProps } from 'lucide-react';
import type { ContentLabPlatform } from '@aixellabs/backend/content-lab/types';
import type { ContentLabBetaPlatform } from '@aixellabs/backend/db/types';
import { cn } from '@/lib/utils';
import { CONTENT_LAB_PLATFORM_LABELS } from '../_constants';

type Platform = ContentLabPlatform | ContentLabBetaPlatform;

/** lucide has no X logo; the official mark, drawn at lucide's 24px grid. */
const XLogo = ({ className, ...props }: LucideProps) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={cn('size-6', className)} {...props}>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
);

const ICON: Record<Platform, React.ComponentType<LucideProps>> = {
    youtube: Youtube,
    instagram: Instagram,
    linkedin: Linkedin,
    x: XLogo,
};

/** Brand colour per platform (text colour, so the icon and any label next to it match). */
export const CONTENT_LAB_PLATFORM_COLOR: Record<Platform, string> = {
    youtube: 'text-[#FF0000]',
    instagram: 'text-[#E1306C]',
    linkedin: 'text-[#0A66C2]',
    x: 'text-foreground',
};

export function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
    const Icon = ICON[platform];
    return <Icon aria-hidden className={cn('size-4 shrink-0', CONTENT_LAB_PLATFORM_COLOR[platform], className)} />;
}

/** Icon + name in a pill; `muted` for platforms we write for but do not search yet. */
export function PlatformPill({ platform, muted, className }: { platform: Platform; muted?: boolean; className?: string }) {
    return (
        <span
            className={cn(
                'bg-card inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
                muted && 'text-muted-foreground border-dashed',
                className,
            )}
        >
            <PlatformIcon platform={platform} className="size-3.5" />
            {CONTENT_LAB_PLATFORM_LABELS[platform]}
        </span>
    );
}
