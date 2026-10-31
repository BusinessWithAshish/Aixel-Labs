'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LINE_FINDER_PERSON_STATUS } from '@aixellabs/backend/line-finder/constants';
import type { ALApiResponse } from '@aixellabs/backend/api/types';
import type { LINE_FINDER_PERSON } from '@aixellabs/backend/line-finder/types';
import {
    addLineFinderPerson,
    listLineFinderPeople,
    removeLineFinderPerson,
    resumeLineFinderPerson,
} from '@/app/actions/line-finder-actions';

export type LinePeoplePageData = {
    people: LINE_FINDER_PERSON[];
    isAdmin: boolean;
};

const POLL_MS = 5_000;

export function useLinePeoplePage(data: LinePeoplePageData) {
    const [people, setPeople] = useState(data.people);
    const [name, setName] = useState('');
    const [spellings, setSpellings] = useState('');
    const [handle, setHandle] = useState('');
    const [saving, setSaving] = useState(false);

    const collecting = people.some((person) => person.status === LINE_FINDER_PERSON_STATUS.COLLECTING);

    useEffect(() => {
        if (!collecting) return;
        const timer = setInterval(async () => {
            const result = await listLineFinderPeople();
            if (result.success && result.data) setPeople(result.data);
        }, POLL_MS);
        return () => clearInterval(timer);
    }, [collecting]);

    const apply = (result: ALApiResponse<LINE_FINDER_PERSON[]>, failure: string): boolean => {
        if (!result.success || !result.data) {
            toast.error(result.error ?? failure);
            return false;
        }
        setPeople(result.data);
        return true;
    };

    const add = async () => {
        setSaving(true);
        const saved = apply(
            await addLineFinderPerson({
                name,
                spellings: spellings
                    .split(',')
                    .map((spelling) => spelling.trim())
                    .filter(Boolean),
                handle: handle.trim() || undefined,
            }),
            'Could not add this person.',
        );
        setSaving(false);
        if (!saved) return;
        setName('');
        setSpellings('');
        setHandle('');
        toast.success('Added. Collecting starts within a minute.');
    };

    const resume = async (personId: string) => apply(await resumeLineFinderPerson(personId), 'Could not start collecting.');

    const remove = async (personId: string) => apply(await removeLineFinderPerson(personId), 'Could not remove this person.');

    return {
        isAdmin: data.isAdmin,
        people,
        name,
        setName,
        spellings,
        setSpellings,
        handle,
        setHandle,
        saving,
        canAdd: name.trim().length >= 2 && !saving,
        add,
        resume,
        remove,
    };
}

export type UseLinePeoplePageReturn = ReturnType<typeof useLinePeoplePage>;
