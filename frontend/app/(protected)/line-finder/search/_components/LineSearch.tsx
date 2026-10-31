'use client';

import { CircleAlert, Loader2, Search } from 'lucide-react';
import Link from 'next/link';
import { LINE_FINDER_LIMITS, LINE_FINDER_PERSON_STATUS, LINE_FINDER_SEARCH_STATE } from '@aixellabs/backend/line-finder/constants';
import { LINE_FINDER_SUB_MODULES } from '@aixellabs/backend/db/types';
import type { LINE_FINDER_SEARCH_RESPONSE } from '@aixellabs/backend/line-finder/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SubModuleUrls } from '@/config/app-config';
import { usePage } from '@/contexts/PageStore';
import type { UseLineSearchPageReturn } from '../_hooks/use-line-search-page';
import { LineResultCard } from './LineResultCard';

const videoCount = (n: number) => `${n} ${n === 1 ? 'video' : 'videos'}`;

function headline(response: LINE_FINDER_SEARCH_RESPONSE, line: string): string {
    const name = response.person.name;
    switch (response.state) {
        case LINE_FINDER_SEARCH_STATE.FOUND:
            return `Found "${line}"`;
        case LINE_FINDER_SEARCH_STATE.CLOSEST:
            return "We didn't find those exact words. These are the closest.";
        case LINE_FINDER_SEARCH_STATE.NOT_FOUND:
            return `We couldn't find this line in ${videoCount(response.person.videos.searched)} of ${name}.`;
        case LINE_FINDER_SEARCH_STATE.NOT_COLLECTED:
            return `We haven't collected ${name} yet.`;
    }
}

function coverage({ person }: LINE_FINDER_SEARCH_RESPONSE): string {
    const { searched, noCaptions, failed } = person.videos;
    const parts = [`Searched ${videoCount(searched)}.`];
    const unsearchable = noCaptions + failed;
    if (unsearchable > 0) {
        parts.push(`${unsearchable} couldn't be searched, usually because they have no captions.`);
    }
    if (person.status === LINE_FINDER_PERSON_STATUS.COLLECTING) parts.push('Still collecting, so try again soon.');
    return parts.join(' ');
}

/** The one page editors use. Everything it says comes from the backend's state, this only draws it. */
export function LineSearch() {
    const page = usePage<UseLineSearchPageReturn>();

    if (page.people.length === 0) {
        return (
            <div className="rounded-lg border p-6 text-sm">
                <p className="font-medium">No one is searchable yet.</p>
                {page.isAdmin ? (
                    <Link className="mt-2 inline-block underline" href={SubModuleUrls[LINE_FINDER_SUB_MODULES.PEOPLE]}>
                        Add someone on the People page
                    </Link>
                ) : (
                    <p className="text-muted-foreground mt-1">Check back soon.</p>
                )}
            </div>
        );
    }

    return (
        <div className="flex w-full flex-col gap-4">
            <form
                className="flex flex-col gap-2 md:flex-row"
                onSubmit={(event) => {
                    event.preventDefault();
                    void page.search();
                }}
            >
                <Select value={page.personId} onValueChange={page.setPersonId}>
                    <SelectTrigger aria-label="Person" className="w-full md:w-64">
                        <SelectValue placeholder="Who said it?" />
                    </SelectTrigger>
                    <SelectContent>
                        {page.people.map((person) => (
                            <SelectItem key={person.id} value={person.id}>
                                {person.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Input
                    aria-label="Line"
                    autoFocus
                    className="flex-1"
                    maxLength={LINE_FINDER_LIMITS.LINE_MAX_LENGTH}
                    onChange={(event) => page.setLine(event.target.value)}
                    placeholder="What did they say? For example: mere paas bahut paisa hai"
                    value={page.line}
                />
                <Button disabled={!page.canSearch} type="submit">
                    {page.searching ? <Loader2 className="animate-spin" /> : <Search />}
                    Find
                </Button>
            </form>

            {page.response ? (
                <section aria-live="polite" className="flex flex-col gap-3">
                    <div>
                        <h2 className="flex items-center gap-2 font-semibold">
                            {page.response.results.length === 0 ? <CircleAlert className="size-4" /> : null}
                            {headline(page.response, page.searchedLine)}
                        </h2>
                        {page.response.state !== LINE_FINDER_SEARCH_STATE.NOT_COLLECTED ? (
                            <p className="text-muted-foreground text-sm">{coverage(page.response)}</p>
                        ) : null}
                    </div>
                    {page.response.results.map((result) => (
                        <LineResultCard
                            isAdmin={page.isAdmin}
                            key={`${result.videoId}-${result.startMs}`}
                            onMark={(label) => void page.mark(result, label)}
                            result={result}
                        />
                    ))}
                </section>
            ) : null}
        </div>
    );
}
