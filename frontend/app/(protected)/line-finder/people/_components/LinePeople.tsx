'use client';

import { Loader2, Play, Plus, Trash2 } from 'lucide-react';
import { LINE_FINDER_PERSON_STATUS } from '@aixellabs/backend/line-finder/constants';
import type { LINE_FINDER_PERSON, LINE_FINDER_PERSON_STATUS_VALUE } from '@aixellabs/backend/line-finder/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { usePage } from '@/contexts/PageStore';
import type { UseLinePeoplePageReturn } from '../_hooks/use-line-people-page';

const STATUS_LABEL: Record<LINE_FINDER_PERSON_STATUS_VALUE, string> = {
    [LINE_FINDER_PERSON_STATUS.NEW]: 'Not started',
    [LINE_FINDER_PERSON_STATUS.COLLECTING]: 'Collecting',
    [LINE_FINDER_PERSON_STATUS.PAUSED]: 'Paused',
    [LINE_FINDER_PERSON_STATUS.DONE]: 'Done',
};

function PersonRow({ person }: { person: LINE_FINDER_PERSON }) {
    const page = usePage<UseLinePeoplePageReturn>();
    const { total, searched, noCaptions, failed, pending } = person.videos;
    const collecting = person.status === LINE_FINDER_PERSON_STATUS.COLLECTING;
    const canCollect = person.status === LINE_FINDER_PERSON_STATUS.PAUSED || person.status === LINE_FINDER_PERSON_STATUS.NEW;

    return (
        <li className="flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{person.name}</span>
                <Badge variant="outline">
                    {collecting ? <Loader2 className="animate-spin" /> : null}
                    {STATUS_LABEL[person.status]}
                </Badge>
                {page.isAdmin ? (
                    <div className="ml-auto flex gap-2">
                        {canCollect ? (
                            <Button onClick={() => void page.resume(person.id)} size="sm" variant="outline">
                                <Play />
                                {person.status === LINE_FINDER_PERSON_STATUS.NEW ? 'Start' : 'Resume'}
                            </Button>
                        ) : null}
                        <Button
                            aria-label={`Remove ${person.name}`}
                            onClick={() => {
                                if (window.confirm(`Remove ${person.name} and their videos from search?`)) void page.remove(person.id);
                            }}
                            size="sm"
                            variant="ghost"
                        >
                            <Trash2 />
                        </Button>
                    </div>
                ) : null}
            </div>

            {person.spellings.length > 0 ? (
                <p className="text-muted-foreground text-xs">Also spelled: {person.spellings.join(', ')}</p>
            ) : null}
            {person.stopReason ? <p className="text-destructive text-sm">{person.stopReason}</p> : null}

            {total > 0 ? (
                <>
                    {pending > 0 ? <Progress value={((total - pending) / total) * 100} /> : null}
                    <p className="text-muted-foreground text-sm">
                        {searched} searchable of {total} videos found. {noCaptions} with no captions
                        {failed > 0 ? `, ${failed} failed` : ''}
                        {pending > 0 ? `, ${pending} to go` : ''}.
                    </p>
                </>
            ) : collecting ? (
                <p className="text-muted-foreground text-sm">Looking for their videos...</p>
            ) : null}
        </li>
    );
}

export function LinePeople() {
    const page = usePage<UseLinePeoplePageReturn>();

    return (
        <div className="flex w-full flex-col gap-4">
            {page.isAdmin ? (
                <form
                    className="flex flex-col gap-2 rounded-lg border p-4 md:flex-row"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (page.canAdd) void page.add();
                    }}
                >
                    <Input
                        aria-label="Name"
                        className="md:w-56"
                        onChange={(event) => page.setName(event.target.value)}
                        placeholder="Name, for example Puneet Superstar"
                        value={page.name}
                    />
                    <Input
                        aria-label="Other spellings, separated by commas"
                        className="flex-1"
                        onChange={(event) => page.setSpellings(event.target.value)}
                        placeholder="Other spellings, separated by commas: Punit Superstar, Lord Puneet"
                        value={page.spellings}
                    />
                    <Input
                        aria-label="Their YouTube handle, if they have one"
                        className="md:w-48"
                        onChange={(event) => page.setHandle(event.target.value)}
                        placeholder="Their @handle (optional)"
                        value={page.handle}
                    />
                    <Button disabled={!page.canAdd} type="submit">
                        <Plus />
                        Add
                    </Button>
                </form>
            ) : null}

            {page.people.length === 0 ? (
                <p className="text-muted-foreground text-sm">No one added yet.</p>
            ) : (
                <ul className="flex flex-col gap-2">
                    {page.people.map((person) => (
                        <PersonRow key={person.id} person={person} />
                    ))}
                </ul>
            )}
        </div>
    );
}
