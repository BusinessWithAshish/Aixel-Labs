import { Grid3x3, Mic, MicOff, Phone, PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CallActionsProps {
    onCall: () => void;
    onHangup: () => void;
    onToggleMute: () => void;
    onToggleKeypad: () => void;
    isCallDisabled: boolean;
    isInCall: boolean;
    isMuted: boolean;
    isKeypadOpen: boolean;
}

const ROUND = 'h-14 w-14 rounded-full shadow-sm [&_svg]:size-6';

export function CallActions({
    onCall,
    onHangup,
    onToggleMute,
    onToggleKeypad,
    isCallDisabled,
    isInCall,
    isMuted,
    isKeypadOpen,
}: CallActionsProps) {
    if (!isInCall) {
        return (
            <Button
                onClick={onCall}
                disabled={isCallDisabled}
                aria-label="Call"
                className={cn(ROUND, 'bg-green-600 text-white hover:bg-green-700')}
            >
                <Phone />
            </Button>
        );
    }
    return (
        <div className="flex items-center justify-center gap-6">
            <Button
                variant={isMuted ? 'default' : 'secondary'}
                onClick={onToggleMute}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
                aria-pressed={isMuted}
                className={ROUND}
            >
                {isMuted ? <MicOff /> : <Mic />}
            </Button>
            <Button variant="destructive" onClick={onHangup} aria-label="Hang up" className={ROUND}>
                <PhoneOff />
            </Button>
            <Button
                variant={isKeypadOpen ? 'default' : 'secondary'}
                onClick={onToggleKeypad}
                aria-label="Keypad"
                aria-pressed={isKeypadOpen}
                className={ROUND}
            >
                <Grid3x3 />
            </Button>
        </div>
    );
}
