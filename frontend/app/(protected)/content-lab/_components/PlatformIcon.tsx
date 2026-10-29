import Image from 'next/image';
import type { ContentLabPlatform } from '@aixellabs/backend/content-lab/types';
import type { ContentLabBetaPlatform } from '@aixellabs/backend/db/types';
import { cn } from '@/lib/utils';
import { CONTENT_LAB_PLATFORM_LABELS } from '../_constants';

type Platform = ContentLabPlatform | ContentLabBetaPlatform;

/** The full-colour brand marks in `public/brand-logos`; YouTube's is wider than tall. */
const LOGO: Record<Platform, { src: string; width: number; height: number }> = {
    youtube: { src: '/brand-logos/youtube.png', width: 185, height: 128 },
    instagram: { src: '/brand-logos/instagram.png', width: 128, height: 128 },
    linkedin: { src: '/brand-logos/linkedin.png', width: 128, height: 128 },
    x: { src: '/brand-logos/x.png', width: 128, height: 128 },
};

/** Brand colour per platform, for text or accents next to the logo. */
export const CONTENT_LAB_PLATFORM_COLOR: Record<Platform, string> = {
    youtube: 'text-[#FF0000]',
    instagram: 'text-[#E1306C]',
    linkedin: 'text-[#0A66C2]',
    x: 'text-foreground',
};

/** The platform's own logo, sized by `className` (a square box; the logo keeps its shape inside it). */
export function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
    const logo = LOGO[platform];
    return (
        <Image
            src={logo.src}
            alt=""
            aria-hidden
            width={logo.width}
            height={logo.height}
            unoptimized
            className={cn('size-4 shrink-0 object-contain', className)}
        />
    );
}

/** Logo + name in a pill; `muted` for platforms we write for but do not search yet. */
export function PlatformPill({ platform, muted, className }: { platform: Platform; muted?: boolean; className?: string }) {
    return (
        <span
            className={cn(
                'bg-card inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
                muted && 'text-muted-foreground border-dashed',
                className,
            )}
        >
            <PlatformIcon platform={platform} className={cn('size-3.5', muted && 'opacity-60')} />
            {CONTENT_LAB_PLATFORM_LABELS[platform]}
        </span>
    );
}
