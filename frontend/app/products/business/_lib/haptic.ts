/**
 * A short buzz in the hand. Android has `navigator.vibrate`. iPhones and iPads give web pages no
 * vibration at all, but since iOS 17.4 Safari makes its own tick whenever a switch is flipped: so a
 * hidden switch is flipped once for every pulse. Older iPhones stay silent.
 */
let toggle: HTMLLabelElement | null = null;

function iosTick() {
    if (typeof document === 'undefined') return;
    if (!toggle) {
        toggle = document.createElement('label');
        toggle.setAttribute('aria-hidden', 'true');
        toggle.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.setAttribute('switch', '');
        input.tabIndex = -1;
        toggle.appendChild(input);
        document.body.appendChild(toggle);
    }
    toggle.click();
}

/** `pulses`: how many buzzes. One for a tap, two or three for news. */
export function buzz(pulses = 1) {
    if (typeof navigator === 'undefined') return;
    if ('vibrate' in navigator) {
        navigator.vibrate(pulses === 1 ? 40 : Array.from({ length: pulses * 2 - 1 }, (_, i) => (i % 2 ? 90 : 160)));
        return;
    }
    for (let i = 0; i < pulses; i++) window.setTimeout(iosTick, i * 130);
}
