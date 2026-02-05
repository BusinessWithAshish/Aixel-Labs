'use client';

import Image from "next/image";
import { cn } from "@/lib/utils";
import { normalizeLogo, useTenantBranding } from "@/contexts/TenantBranding";

type AppLogoProps = {
    size?: number;
    className?: string;
    src?: string;
    alt?: string;
    title?: string;
};

export const AppLogo = ({
    size = 30,
    className,
    src,
    title,
    alt = "App Logo",
}: AppLogoProps) => {
    const { appLogoUrl } = useTenantBranding();

    const logoUrl = normalizeLogo(src ?? appLogoUrl);

    return (
        <Image
            src={logoUrl}
            alt={alt}
            title={title}
            width={size}
            height={size}
            className={cn("border border-ring rounded-full p-1 bg-white shrink-0", className)}
            priority={true}
        />
    );
};