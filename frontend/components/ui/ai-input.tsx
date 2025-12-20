'use client';

import type React from 'react';
import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Sparkles, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface AIInputProps {
    /** Input variant - 'input' for a single line, 'textarea' for multi-line */
    variant?: 'input' | 'textarea';
    /** Placeholder text */
    placeholder?: string;
    /** Current value (controlled) */
    value: string;
    /** Value change handler (controlled) */
    onChange: (value: string) => void;
    /** Submit handler - called when user presses Enter (input) or Cmd+Enter (textarea) */
    onSubmit?: () => void;
    /** Whether the input is disabled */
    disabled?: boolean;
    /** Whether a loading state is active */
    isLoading?: boolean;
    /** Additional CSS classes for the outer container */
    className?: string;
    /** Additional CSS classes for the input element */
    inputClassName?: string;
    /** Custom left icon (defaults to Sparkles) */
    leftIcon?: React.ReactNode;
    /** Additional action buttons to show before the send button */
    actionButtons?: React.ReactNode;
    /** Whether to show the send button (default: true) */
    showSendButton?: boolean;
    /** Whether to show the helper text for textarea variant (default: true) */
    showHelperText?: boolean;
    /** Custom helper text */
    helperText?: string;
    /** Whether to show the "Powered by AI" footer (default: false) */
    showPoweredBy?: boolean;
    /** Maximum height for textarea (default: 200) */
    maxHeight?: number;
    /** Minimum rows for textarea (default: 1) */
    minRows?: number;
}

export interface AIInputRef {
    focus: () => void;
    blur: () => void;
}

export const AIInput = forwardRef<AIInputRef, AIInputProps>(function AIInput(
    {
        variant = 'textarea',
        placeholder = 'Ask me anything...',
        value,
        onChange,
        onSubmit,
        disabled = false,
        isLoading = false,
        className,
        inputClassName,
        leftIcon,
        actionButtons,
        showSendButton = true,
        showHelperText = true,
        helperText,
        showPoweredBy = false,
        maxHeight = 200,
        minRows = 1,
    },
    ref,
) {
    const [isFocused, setIsFocused] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

    // Expose focus/blur methods via ref
    useImperativeHandle(ref, () => ({
        focus: () => inputRef.current?.focus(),
        blur: () => inputRef.current?.blur(),
    }));

    const handleSubmit = useCallback(() => {
        if (value.trim() && !disabled && !isLoading) {
            onSubmit?.();
        }
    }, [value, disabled, isLoading, onSubmit]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey && variant === 'input') {
                e.preventDefault();
                handleSubmit();
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && variant === 'textarea') {
                e.preventDefault();
                handleSubmit();
            }
        },
        [variant, handleSubmit],
    );

    // Auto-resize textarea
    useEffect(() => {
        if (variant === 'textarea' && inputRef.current) {
            const textarea = inputRef.current as HTMLTextAreaElement;
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
        }
    }, [value, variant, maxHeight]);

    const isActive = isFocused || isHovered;
    const canSubmit = value.trim() && !disabled && !isLoading;

    const defaultHelperText =
        variant === 'textarea' ? (
            <>
                Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-foreground font-mono text-[10px]">⌘</kbd> +{' '}
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-foreground font-mono text-[10px]">Enter</kbd> to send
            </>
        ) : null;

    return (
        <div className={cn('w-full', className)}>
            <div className="relative group">
                {/* Rainbow gradient border */}
                <div
                    className={cn(
                        'absolute -inset-px rounded-xl transition-opacity duration-500 ease-in-out',
                        isActive ? 'opacity-100' : 'opacity-0',
                    )}
                >
                    <div
                        className="absolute inset-0 rounded-xl animate-ai-rainbow-flow"
                        style={{
                            background:
                                'linear-gradient(90deg, #ff0000 0%, #ff7f00 14%, #ffff00 28%, #00ff00 42%, #0099ff 56%, #4b0082 70%, #9400d3 84%, #ff0000 100%)',
                            backgroundSize: '300% 100%',
                        }}
                    />
                </div>

                {/* Shimmer effect */}
                {isFocused && (
                    <div className="absolute -inset-px rounded-xl overflow-hidden opacity-50 pointer-events-none">
                        <div
                            className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white to-transparent animate-ai-shimmer"
                            style={{ width: '50%' }}
                        />
                    </div>
                )}

                {/* Main input container */}
                <div
                    className={cn(
                        'relative bg-card rounded-xl border border-border transition-all duration-300',
                        'shadow-sm hover:shadow-md',
                        isFocused && 'shadow-lg shadow-primary/10',
                    )}
                >
                    {/* Glow effect background */}
                    {/*{isFocused && (*/}
                    {/*    <div className="absolute inset-0 bg-linear-to-r from-primary/5 via-primary/10 to-primary/5 rounded-xl animate-ai-pulse-glow" />*/}
                    {/*)}*/}

                    <div className="relative flex items-end gap-2 p-3">
                        {/* Left icon indicator */}
                        <div
                            className={cn(
                                'flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-300 shrink-0',
                                isFocused
                                    ? 'bg-linear-to-br from-primary to-primary/80 shadow-lg shadow-primary/30'
                                    : 'bg-muted',
                            )}
                        >
                            {leftIcon || (
                                <Sparkles
                                    className={cn(
                                        'w-4 h-4 transition-all duration-300',
                                        isFocused ? 'text-primary-foreground' : 'text-muted-foreground',
                                    )}
                                />
                            )}
                        </div>

                        {/* Input field */}
                        <div className="flex-1 relative">
                            {variant === 'textarea' ? (
                                <textarea
                                    ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                                    value={value}
                                    onChange={(e) => onChange(e.target.value)}
                                    onFocus={() => setIsFocused(true)}
                                    onBlur={() => setIsFocused(false)}
                                    onMouseEnter={() => setIsHovered(true)}
                                    onMouseLeave={() => setIsHovered(false)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={disabled ? 'Please wait...' : placeholder}
                                    disabled={disabled}
                                    rows={minRows}
                                    className={cn(
                                        'w-full bg-transparent text-foreground placeholder:text-muted-foreground',
                                        'resize-none outline-none text-sm leading-relaxed py-1.5',
                                        'min-h-[24px] overflow-y-auto',
                                        'scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent',
                                        'disabled:opacity-50 disabled:cursor-not-allowed',
                                        inputClassName,
                                    )}
                                    style={{ maxHeight }}
                                />
                            ) : (
                                <input
                                    ref={inputRef as React.RefObject<HTMLInputElement>}
                                    type="text"
                                    value={value}
                                    onChange={(e) => onChange(e.target.value)}
                                    onFocus={() => setIsFocused(true)}
                                    onBlur={() => setIsFocused(false)}
                                    onMouseEnter={() => setIsHovered(true)}
                                    onMouseLeave={() => setIsHovered(false)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={disabled ? 'Please wait...' : placeholder}
                                    disabled={disabled}
                                    className={cn(
                                        'w-full bg-transparent text-foreground placeholder:text-muted-foreground',
                                        'outline-none text-sm leading-relaxed py-1.5',
                                        'disabled:opacity-50 disabled:cursor-not-allowed',
                                        inputClassName,
                                    )}
                                />
                            )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                            {actionButtons}

                            {showSendButton && (
                                <Button
                                    onClick={handleSubmit}
                                    disabled={!canSubmit}
                                    className={cn(
                                        'w-9 h-9 rounded-lg transition-all duration-300',
                                        'disabled:opacity-50 disabled:cursor-not-allowed',
                                        canSubmit
                                            ? 'bg-linear-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-primary-foreground shadow-lg shadow-primary/30'
                                            : 'bg-muted text-muted-foreground',
                                    )}
                                    size="icon"
                                    type="button"
                                >
                                    <Send className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Helper text */}
                    {showHelperText && variant === 'textarea' && (
                        <div
                            className={cn(
                                'px-4 pb-3 text-xs transition-all duration-300',
                                isFocused ? 'text-muted-foreground' : 'text-muted-foreground/60',
                            )}
                        >
                            {helperText || defaultHelperText}
                        </div>
                    )}
                </div>
            </div>

            {/* Powered by indicator */}
            {showPoweredBy && (
                <div className="flex items-center justify-center gap-2 mt-4 text-xs text-muted-foreground">
                    <Sparkles className="w-3 h-3" />
                    <span>Powered by advanced {process.env.NEXT_PUBLIC_APP_NAME}</span>
                </div>
            )}
        </div>
    );
});

AIInput.displayName = 'AIInput';
