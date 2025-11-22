import { DIALPAD_BUTTONS } from "../_utils/constants";
import { DialpadButton } from "./DialpadButton";
import { cn } from "@/lib/utils";

type DialpadProps = {
  onButtonClick: (value: string) => void;
  onLongPress?: (value: string) => void;
  className?: string;
};

export function Dialpad({ onButtonClick, onLongPress, className }: DialpadProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-3 gap-4 sm:gap-6 w-full max-w-sm mx-auto px-4",
        className
      )}
    >
      {DIALPAD_BUTTONS.map((button) => (
        <DialpadButton
          key={button.value}
          value={button.value}
          label={button.label}
          subLabel={button.subLabel}
          onClick={onButtonClick}
          onLongPress={button.value === "0" ? onLongPress : undefined}
        />
      ))}
    </div>
  );
}
