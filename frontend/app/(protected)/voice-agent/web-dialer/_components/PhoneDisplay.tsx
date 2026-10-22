import { Delete } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface PhoneDisplayProps {
    value: string;
    onChange: (value: string) => void;
    onBackspace: () => void;
    onEnter: () => void;
}

/** The number being dialled: type, paste or use the keypad; Enter calls. */
export function PhoneDisplay({ value, onChange, onBackspace, onEnter }: PhoneDisplayProps) {
    return (
        <div className="relative">
            <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onEnter()}
                placeholder="Type or paste a number"
                aria-label="Number to call"
                className="h-14 border-0 bg-transparent px-10 text-center text-2xl font-medium tabular-nums shadow-none placeholder:text-base focus-visible:ring-0 sm:text-3xl dark:bg-transparent"
            />
            {value ? (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onBackspace}
                    aria-label="Delete last digit"
                    className="absolute top-1/2 right-0 -translate-y-1/2 rounded-full"
                >
                    <Delete />
                </Button>
            ) : null}
        </div>
    );
}
