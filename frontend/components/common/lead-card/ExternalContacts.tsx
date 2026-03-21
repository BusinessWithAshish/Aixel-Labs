'use client';

import { Button } from '@/components/ui/button';
import { Globe, Phone, Mail, ExternalLink, Copy } from 'lucide-react';
import { copyPhoneNumber, copyEmail } from '@/lib/clipboard';
import { useState } from 'react';
import ConditionalRendering from '../ConditionalRendering';
import { Else, If } from '../ConditionalRendering';
import { cn } from '@/lib/utils';

const DEFAULT_DISPLAY_VALUE = 'N/A';
const EMPTY_MESSAGE_WEBSITE = 'No website';
const EMPTY_MESSAGE_PHONE = 'No phone number';
const EMPTY_MESSAGE_EMAIL = 'No email';

const hasValue = (value: string | null | undefined): boolean => {
    return !!value?.trim();
};

const CONTACT_NORMAL = 'text-blue-600';
const CONTACT_HOVER = 'group-hover/contact:text-blue-500';
const CONTACT_SELF_HOVER = 'hover:text-blue-500';

const PHONE_NORMAL = 'text-green-600';
const PHONE_HOVER = 'group-hover/contact:text-green-500';

// ---------------------------------------------------------------------------
// Website
// ---------------------------------------------------------------------------

type WebsiteProps = {
    value?: string | null;
    label?: string;
    className?: string;
};

export const Website = ({ value, label = 'Website', className }: WebsiteProps) => (
    <div className={cn('flex items-center gap-2 group/contact transition-colors', className)}>
        <Globe className={cn('w-4 h-4 shrink-0 transition-colors', CONTACT_NORMAL, CONTACT_HOVER)} />
        <ConditionalRendering>
            <If condition={hasValue(value)}>
                <a
                    href={value ?? ''}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn('transition-colors flex items-center gap-1 truncate text-sm hover:underline', CONTACT_NORMAL, CONTACT_HOVER)}
                >
                    {label}
                    <ExternalLink className={cn('w-4 h-4 shrink-0 transition-colors', CONTACT_NORMAL, CONTACT_HOVER)} />
                </a>
            </If>
            <Else>
                <span className="text-muted-foreground italic text-sm">{EMPTY_MESSAGE_WEBSITE}</span>
            </Else>
        </ConditionalRendering>
    </div>
);

// ---------------------------------------------------------------------------
// WebsiteList - for multiple websites (e.g. Instagram)
// ---------------------------------------------------------------------------

type WebsiteListProps = {
    websites: string[];
    className?: string;
};

export const WebsiteList = ({ websites, className }: WebsiteListProps) => {
    if (!websites?.length) return null;
    return (
        <div className={cn('flex flex-col gap-2 w-full min-w-0', className)}>
            {websites.map((website) => (
                <a
                    key={website}
                    href={website}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={website}
                    className={cn(
                        'flex items-center gap-2 w-full min-w-0 text-sm transition-colors group/contact hover:underline',
                        CONTACT_NORMAL,
                        CONTACT_HOVER,
                        CONTACT_SELF_HOVER,
                    )}
                >
                    <Globe className={cn('size-4 shrink-0 transition-colors', CONTACT_NORMAL, CONTACT_HOVER)} />
                    <span className="min-w-0 truncate">{website}</span>
                    <ExternalLink className={cn('w-4 h-4 shrink-0 transition-colors', CONTACT_NORMAL, CONTACT_HOVER)} />
                </a>
            ))}
        </div>
    );
};

// ---------------------------------------------------------------------------
// PhoneNumber
// ---------------------------------------------------------------------------

type PhoneNumberProps = {
    value?: string | null;
    className?: string;
    /** When true, render nothing if value is empty (for cards that only show existing contacts) */
    hideWhenEmpty?: boolean;
};

export const PhoneNumber = ({ value, className, hideWhenEmpty }: PhoneNumberProps) => {
    const [isHovered, setIsHovered] = useState(false);
    if (hideWhenEmpty && !hasValue(value)) return null;

    const handleCopy = async () => {
        if (hasValue(value)) {
            await copyPhoneNumber(value ?? '');
        }
    };

    return (
        <div
            className={cn('flex items-center gap-2 group/contact transition-colors', className)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <Phone className={cn('w-4 h-4 shrink-0 transition-colors', PHONE_NORMAL, PHONE_HOVER)} />
            <div className="min-w-0 flex-1 flex items-center gap-2 overflow-hidden">
                <ConditionalRendering>
                    <If condition={hasValue(value)}>
                        <a
                            href={value ? `tel:${value}` : undefined}
                            className={cn('text-sm truncate hover:underline transition-colors min-w-0', PHONE_NORMAL, PHONE_HOVER)}
                            title={value ?? DEFAULT_DISPLAY_VALUE}
                        >
                            {value ?? DEFAULT_DISPLAY_VALUE}
                        </a>
                        <Button
                            onClick={handleCopy}
                            variant="ghost"
                            size="icon"
                            className={cn(
                                'h-6 w-6 rounded-md hover:bg-muted transition-all shrink-0',
                                'opacity-100 sm:opacity-0 sm:group-hover/contact:opacity-100',
                                isHovered && 'sm:scale-110',
                            )}
                            title="Copy phone number"
                            aria-label="Copy phone number to clipboard"
                        >
                            <Copy className={cn('w-3.5 h-3.5 transition-colors', PHONE_NORMAL, PHONE_HOVER)} />
                        </Button>
                    </If>
                    <Else>
                        <span className="text-muted-foreground italic text-sm">{EMPTY_MESSAGE_PHONE}</span>
                    </Else>
                </ConditionalRendering>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

type EmailProps = {
    value?: string | null;
    className?: string;
    /** When true, render nothing if value is empty (for cards that only show existing contacts) */
    hideWhenEmpty?: boolean;
};

export const Email = ({ value, className, hideWhenEmpty }: EmailProps) => {
    const [isHovered, setIsHovered] = useState(false);
    if (hideWhenEmpty && !hasValue(value)) return null;

    const handleCopy = async () => {
        if (hasValue(value)) {
            await copyEmail(value ?? '');
        }
    };

    return (
        <div
            className={cn('flex items-center gap-2 group/contact transition-colors', className)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <Mail className={cn('w-4 h-4 shrink-0 transition-colors', CONTACT_NORMAL, CONTACT_HOVER)} />
            <div className="min-w-0 flex-1 flex items-center gap-2 overflow-hidden">
                <ConditionalRendering>
                    <If condition={hasValue(value)}>
                        <a
                            href={value ? `mailto:${value}` : undefined}
                            className={cn('text-sm truncate hover:underline transition-colors min-w-0', CONTACT_NORMAL, CONTACT_HOVER)}
                            title={value ?? DEFAULT_DISPLAY_VALUE}
                        >
                            {value ?? DEFAULT_DISPLAY_VALUE}
                        </a>
                        <Button
                            onClick={handleCopy}
                            variant="ghost"
                            size="icon"
                            className={cn(
                                'h-6 w-6 rounded-md hover:bg-muted transition-all shrink-0',
                                'opacity-100 sm:opacity-0 sm:group-hover/contact:opacity-100',
                                isHovered && 'sm:scale-110',
                            )}
                            title="Copy email"
                            aria-label="Copy email to clipboard"
                        >
                            <Copy className={cn('w-3.5 h-3.5 transition-colors', CONTACT_NORMAL, CONTACT_HOVER)} />
                        </Button>
                    </If>
                    <Else>
                        <span className="text-muted-foreground italic text-sm">{EMPTY_MESSAGE_EMAIL}</span>
                    </Else>
                </ConditionalRendering>
            </div>
        </div>
    );
};
