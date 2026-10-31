'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { LINE_FINDER_LIMITS, LINE_FINDER_SPEAKER } from '@aixellabs/backend/line-finder/constants';
import type {
    LINE_FINDER_PERSON,
    LINE_FINDER_RESULT,
    LINE_FINDER_SEARCH_RESPONSE,
} from '@aixellabs/backend/line-finder/types';
import { markLineFinderSpeaker, searchLineFinder } from '@/app/actions/line-finder-actions';

export type LineSearchPageData = {
    people: LINE_FINDER_PERSON[];
    isAdmin: boolean;
};

type MarkLabel = typeof LINE_FINDER_SPEAKER.CONFIRMED | typeof LINE_FINDER_SPEAKER.SOMEONE_ELSE;

export function useLineSearchPage({ people, isAdmin }: LineSearchPageData) {
    const searchable = useMemo(() => people.filter((person) => person.videos.searched > 0), [people]);
    const [personId, setPersonId] = useState(searchable[0]?.id ?? '');
    const [line, setLine] = useState('');
    const [searching, setSearching] = useState(false);
    const [response, setResponse] = useState<LINE_FINDER_SEARCH_RESPONSE | null>(null);
    /** The line those results are for, so typing a new one doesn't relabel what's on screen. */
    const [searchedLine, setSearchedLine] = useState('');

    const canSearch = !!personId && line.trim().length > 0 && line.length <= LINE_FINDER_LIMITS.LINE_MAX_LENGTH && !searching;

    const search = async () => {
        if (!canSearch) return;
        setSearching(true);
        const result = await searchLineFinder({ personId, line });
        setSearching(false);
        if (!result.success || !result.data) {
            toast.error(result.error ?? 'Search failed. Try again.');
            return;
        }
        setResponse(result.data);
        setSearchedLine(line.trim());
    };

    const mark = async (target: LINE_FINDER_RESULT, label: MarkLabel) => {
        if (!response) return;
        const result = await markLineFinderSpeaker({
            personId: response.person.id,
            videoId: target.videoId,
            startMs: target.startMs,
            label,
        });
        if (!result.success) {
            toast.error(result.error ?? 'Could not save that.');
            return;
        }
        setResponse({
            ...response,
            results: response.results.map((r) =>
                r.videoId === target.videoId && r.startMs === target.startMs ? { ...r, speaker: label } : r,
            ),
        });
    };

    return { isAdmin, people: searchable, personId, setPersonId, line, setLine, canSearch, searching, search, response, searchedLine, mark };
}

export type UseLineSearchPageReturn = ReturnType<typeof useLineSearchPage>;
