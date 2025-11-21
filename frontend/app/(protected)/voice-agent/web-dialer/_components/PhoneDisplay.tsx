import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

interface PhoneDisplayProps {
  value: string;
  onChange: (value: string) => void;
  onBackspace: () => void;
  className?: string;
}

export function PhoneDisplay({
  value,
  onChange,
  onBackspace,
  className,
}: PhoneDisplayProps) {
  return (
    <div
      className={cn(
        "relative w-full flex items-center gap-2 px-2 sm:px-4",
        className
      )}
    >
      <Input
        type="tel"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter phone number"
        className="text-xl sm:text-2xl text-center h-12 sm:h-14 border-0 focus-visible:ring-0 bg-transparent"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onBackspace}
          className="h-8 w-8 rounded-full shrink-0"
        >
          <Delete className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
