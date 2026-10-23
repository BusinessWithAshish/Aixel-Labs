import { Input } from '@/components/ui/input';

interface PhoneDisplayProps {
    value: string;
    onChange: (value: string) => void;
    onEnter: () => void;
}

/** The number being dialled: type, paste or use the keypad; Enter calls. No on-screen keyboard: the keypad is it. */
export function PhoneDisplay({ value, onChange, onEnter }: PhoneDisplayProps) {
    return (
        <Input
            type="tel"
            inputMode="none"
            autoComplete="tel"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onEnter()}
            placeholder="Type or paste a number"
            aria-label="Number to call"
            className="h-14 border-0 bg-transparent px-2 text-center text-3xl font-normal md:text-3xl tabular-nums shadow-none placeholder:text-base focus-visible:ring-0 dark:bg-transparent"
        />
    );
}
