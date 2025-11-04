import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DialpadButtonProps {
  value: string;
  label: string;
  subLabel?: string;
  onClick: (value: string) => void;
  className?: string;
}

export function DialpadButton({
  value,
  label,
  subLabel,
  onClick,
  className,
}: DialpadButtonProps) {
  return (
    <Button
      variant="ghost"
      onClick={() => onClick(value)}
      className={cn(
        "h-16 w-16 sm:h-20 sm:w-20 rounded-full",
        "flex flex-col items-center justify-center",
        "hover:bg-accent transition-colors",
        "border border-border/50",
        "focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <span className="text-2xl sm:text-3xl font-normal">{label}</span>
      {subLabel && (
        <span className="text-xs text-muted-foreground font-light mt-0.5">
          {subLabel}
        </span>
      )}
    </Button>
  );
}
