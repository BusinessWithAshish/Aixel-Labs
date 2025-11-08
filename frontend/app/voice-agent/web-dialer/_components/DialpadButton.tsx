import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRef, useCallback } from "react";

type DialpadButtonProps = {
  value: string;
  label: string;
  subLabel?: string;
  onClick: (value: string) => void;
  onLongPress?: (value: string) => void;
  className?: string;
};

export function DialpadButton({
  value,
  label,
  subLabel,
  onClick,
  onLongPress,
  className,
}: DialpadButtonProps) {
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isPressedRef = useRef(false);
  const longPressTriggeredRef = useRef(false);

  const handlePointerDown = useCallback(() => {
    isPressedRef.current = true;
    longPressTriggeredRef.current = false;

    if (onLongPress) {
      pressTimerRef.current = setTimeout(() => {
        if (isPressedRef.current) {
          longPressTriggeredRef.current = true;
          onLongPress(value);
        }
      }, 500); // 500ms for long press
    }
  }, [onLongPress, value]);

  const handlePointerUp = useCallback(() => {
    isPressedRef.current = false;

    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }

    // Only trigger onClick if long press was not triggered
    if (!longPressTriggeredRef.current) {
      onClick(value);
    }
  }, [onClick, value]);

  const handlePointerLeave = useCallback(() => {
    isPressedRef.current = false;

    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }, []);

  return (
    <Button
      variant="ghost"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      className={cn(
        "h-16 w-16 sm:h-20 sm:w-20 rounded-full",
        "flex flex-col items-center justify-center gap-0",
        "hover:bg-accent transition-colors",
        "border border-border/50",
        "focus-visible:ring-2 focus-visible:ring-ring",
        "select-none touch-none",
        className
      )}
    >
      <span className="text-2xl sm:text-3xl font-medium leading-none">
        {label}
      </span>
      {subLabel && (
        <span className="text-[10px] sm:text-xs text-muted-foreground font-light leading-none mt-1">
          {subLabel}
        </span>
      )}
    </Button>
  );
}
