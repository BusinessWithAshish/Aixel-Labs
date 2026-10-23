import { DIALPAD_BUTTONS } from '../_utils/constants';
import { DialpadButton } from './DialpadButton';

type DialpadProps = {
    onButtonClick: (value: string) => void;
    /** Holding 0 (types "+"); left out during a call. */
    onLongPress?: (value: string) => void;
};

export function Dialpad({ onButtonClick, onLongPress }: DialpadProps) {
    return (
        <div className="grid grid-cols-3 justify-items-center gap-x-6 gap-y-3.5">
            {DIALPAD_BUTTONS.map((button) => (
                <DialpadButton
                    key={button.value}
                    value={button.value}
                    label={button.label}
                    subLabel={button.subLabel}
                    onClick={onButtonClick}
                    onLongPress={button.value === '0' ? onLongPress : undefined}
                />
            ))}
        </div>
    );
}
