import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LONG_PRESS_MS, ROUND_BUTTON } from '../_utils/constants';

type DialpadButtonProps = {
    value: string;
    label: string;
    subLabel?: string;
    onClick: (value: string) => void;
    onLongPress?: (value: string) => void;
};

/** An iOS keypad key: the digit with its letters underneath. Held, it fires `onLongPress` instead of `onClick`. */
export function DialpadButton({ value, label, subLabel, onClick, onLongPress }: DialpadButtonProps) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressedRef = useRef(false);

    const cancel = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
    };
    useEffect(() => cancel, []);

    return (
        <Button
            variant="secondary"
            onPointerDown={() => {
                longPressedRef.current = false;
                if (!onLongPress) return;
                timerRef.current = setTimeout(() => {
                    timerRef.current = null;
                    longPressedRef.current = true;
                    onLongPress(value);
                }, LONG_PRESS_MS);
            }}
            onPointerUp={() => {
                cancel();
                if (!longPressedRef.current) onClick(value);
            }}
            onPointerLeave={cancel}
            onPointerCancel={cancel}
            // A held finger would open the browser's menu.
            onContextMenu={(e) => e.preventDefault()}
            // Enter / Space (a click with no pointer behind it)
            onClick={(e) => e.detail === 0 && onClick(value)}
            aria-label={label}
            className={cn(
                ROUND_BUTTON,
                'bg-muted hover:bg-muted active:bg-muted-foreground/30 flex flex-col gap-0 transition-colors select-none touch-none',
            )}
        >
            <span className="text-3xl leading-none font-normal">{label}</span>
            {subLabel ? (
                <span className="text-muted-foreground mt-0.5 text-[0.625rem] leading-none font-semibold tracking-[0.18em]">
                    {subLabel}
                </span>
            ) : null}
        </Button>
    );
}
