import Image from "next/image";
import { cn } from "@/lib/utils";

type AppLogoProps = {
    size?: number;
    className?: string;
}

export const AppLogo = ({ size = 30, className }: AppLogoProps) => {
    return (
        <Image
            src="/aixellabs.svg"
            alt="Aixel Labs Bot Icon"
            width={size}
            height={size}
            className={cn("border border-ring rounded-full p-1 bg-white shrink-0", className)}
            priority={true}
        />
    )
}