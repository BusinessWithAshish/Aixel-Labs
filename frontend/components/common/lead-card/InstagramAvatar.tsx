"use client";

import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { pickInstagramAvatarCdnUrl } from "@/helpers/instagram-image";
import { loadInstagramAvatarBlobUrl } from "@/helpers/instagram-avatar-loader";

type InstagramAvatarProps = {
  fullName: string;
  profilePicture?: string | null;
  profilePictureHd?: string | null;
  className?: string;
  fallbackClassName?: string;
  /** Use HD source (large hero). Default prefers the small thumbnail. */
  preferHd?: boolean;
};

function initialsFromName(name: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "N/A") return "?";
  return trimmed
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Instagram list avatar.
 *
 * Loads via `/api/instagram/image` → `blob:` URL (CORP-safe). A shared
 * concurrency pool (max 6) + session blob cache prevents network/terminal
 * stampedes on large virtualized lead lists.
 */
export function InstagramAvatar({
  fullName,
  profilePicture,
  profilePictureHd,
  className,
  fallbackClassName,
  preferHd = false,
}: InstagramAvatarProps) {
  const cdnUrl = pickInstagramAvatarCdnUrl({
    profilePicture,
    profilePictureHd,
    preferHd,
  });
  const [src, setSrc] = useState<string | undefined>();

  useEffect(() => {
    if (!cdnUrl) {
      setSrc(undefined);
      return;
    }

    let cancelled = false;
    void loadInstagramAvatarBlobUrl(cdnUrl)
      .then((blobUrl) => {
        if (!cancelled) setSrc(blobUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [cdnUrl]);

  return (
    <Avatar className={cn("size-10 shrink-0", className)}>
      {src ? (
        <AvatarImage src={src} alt={fullName} decoding="async" />
      ) : null}
      <AvatarFallback className={cn("text-lg", fallbackClassName)}>
        {initialsFromName(fullName)}
      </AvatarFallback>
    </Avatar>
  );
}
