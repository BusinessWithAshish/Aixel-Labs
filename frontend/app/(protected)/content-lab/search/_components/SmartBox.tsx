'use client';

import { type FormEvent, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SearchIcon } from 'lucide-react';
import { CONTENT_LAB_ERROR_MESSAGES } from '@aixellabs/backend/content-lab/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CONTENT_LAB_EXPLORE_ROUTE } from '@/config/app-config';
import { cn } from '@/lib/utils';
import { CONTENT_LAB_SMART_BOX_EXAMPLES, CONTENT_LAB_SMART_BOX_HINTS } from '../../_constants';
import { detectQuery, smartQueryHref } from '../_utils/smart-box';

type SmartBoxProps = {
    defaultValue?: string;
    /** `lg` on Search home, `default` above results. */
    size?: 'lg' | 'default';
    className?: string;
};

/**
 * One box for a topic, a YouTube/Instagram link or an @creator; says what it understood as you type.
 * A plain GET form underneath, so it works before hydration (the explore page re-routes links and creators).
 */
export function SmartBox({ defaultValue = '', size = 'lg', className }: SmartBoxProps) {
    const router = useRouter();
    const hintId = useId();
    const [value, setValue] = useState(defaultValue);
    const detected = detectQuery(value);
    const href = detected ? smartQueryHref(detected) : null;

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (href) router.push(href);
    };

    return (
        <form action={CONTENT_LAB_EXPLORE_ROUTE} onSubmit={submit} className={cn('flex flex-col gap-2', className)}>
            <div className="flex gap-2">
                <Input
                    name="q"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    required
                    autoComplete="off"
                    aria-label="Topic, link or @creator"
                    aria-describedby={hintId}
                    placeholder="protein breakfast · youtube.com/watch?v=… · @creator"
                    className={cn('min-w-0', size === 'lg' && 'h-12 text-base')}
                />
                <Button type="submit" size={size === 'lg' ? 'lg' : 'default'} className={cn(size === 'lg' && 'h-12')} disabled={!!detected && !href}>
                    <SearchIcon /> Go
                </Button>
            </div>
            <p id={hintId} aria-live="polite" className="text-muted-foreground text-sm">
                {!detected ? (
                    <>
                        Try:{' '}
                        {CONTENT_LAB_SMART_BOX_EXAMPLES.map((example, index) => (
                            <span key={example}>
                                {index > 0 ? (index === CONTENT_LAB_SMART_BOX_EXAMPLES.length - 1 ? ' or ' : ', ') : null}
                                <button
                                    type="button"
                                    onClick={() => setValue(example)}
                                    className="text-foreground font-medium break-all underline-offset-2 hover:underline"
                                >
                                    {example}
                                </button>
                            </span>
                        ))}
                    </>
                ) : detected.kind === 'unsupported' ? (
                    <span className="text-destructive">{CONTENT_LAB_ERROR_MESSAGES.UNSUPPORTED_URL}</span>
                ) : (
                    <>
                        Looks like a <b className="text-foreground">{detected.kind}</b> → {CONTENT_LAB_SMART_BOX_HINTS[detected.kind]}
                    </>
                )}
            </p>
        </form>
    );
}
