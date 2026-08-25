'use client';

import { useState } from 'react';
import {
    BooleanControlledField,
    NumberControlledField,
    StringArrayControlledField,
} from '@/components/common/zod-form-builder/ZodControlledFields';
import { Button } from '@/components/ui/button';
import { CRAWL } from '@aixellabs/backend/crawl/constants';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { CRAWL_MAX_DOMAINS } from '../_constants';

export const CrawlQueryForm = () => {
    const [advancedOpen, setAdvancedOpen] = useState(false);

    return (
        <>
            <StringArrayControlledField
                name="domains"
                label="Domains / URLs"
                description={`Add domains (acme.com) or full URLs (https://acme.com/about). Max ${CRAWL_MAX_DOMAINS}.`}
                required={true}
            />

            <div className="pt-1">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1 px-0 text-muted-foreground"
                    onClick={() => setAdvancedOpen((open) => !open)}
                >
                    {advancedOpen ? (
                        <ChevronUp className="h-4 w-4" />
                    ) : (
                        <ChevronDown className="h-4 w-4" />
                    )}
                    Advanced crawl options
                </Button>

                {advancedOpen ? (
                    <div className="mt-3 space-y-3 rounded-md border p-3">
                        <NumberControlledField
                            name="maxPages"
                            label="Max pages"
                            description={`Pages to crawl per domain (1–${CRAWL.HARD_MAX_PAGES})`}
                            required={false}
                            min={1}
                            max={CRAWL.HARD_MAX_PAGES}
                        />
                        <NumberControlledField
                            name="maxDepth"
                            label="Max depth"
                            description={`Link depth from homepage (0–${CRAWL.HARD_MAX_DEPTH})`}
                            required={false}
                            min={0}
                            max={CRAWL.HARD_MAX_DEPTH}
                        />
                        <BooleanControlledField
                            name="thorough"
                            label="Thorough crawl"
                            description="Disable early-exit after email, phone, and social are found"
                            required={false}
                        />
                    </div>
                ) : null}
            </div>
        </>
    );
};
