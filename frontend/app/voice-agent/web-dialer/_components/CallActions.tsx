import { Button } from "@/components/ui/button";
import { Phone, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface CallActionsProps {
  onCall: () => void;
  onHangup: () => void;
  isCallDisabled: boolean;
  isInCall: boolean;
  className?: string;
}

export function CallActions({
  onCall,
  onHangup,
  isCallDisabled,
  isInCall,
  className,
}: CallActionsProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4 w-full max-w-sm mx-auto px-4",
        className
      )}
    >
      {!isInCall ? (
        <Button
          onClick={onCall}
          disabled={isCallDisabled}
          size="lg"
          className={cn(
            "h-14 w-14 sm:h-16 sm:w-16 rounded-full",
            "bg-green-600 hover:bg-green-700 text-white",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "flex items-center justify-center",
            "shadow-lg"
          )}
        >
          <Phone className="h-6 w-6 sm:h-7 sm:w-7" />
        </Button>
      ) : (
        <Button
          onClick={onHangup}
          size="lg"
          className={cn(
            "h-14 w-14 sm:h-16 sm:w-16 rounded-full",
            "bg-red-600 hover:bg-red-700 text-white",
            "flex items-center justify-center",
            "shadow-lg"
          )}
        >
          <PhoneOff className="h-6 w-6 sm:h-7 sm:w-7" />
        </Button>
      )}
    </div>
  );
}
