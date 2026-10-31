'use client';

import { useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import { LINE_FINDER_MATCH_KIND, LINE_FINDER_SPEAKER } from '@aixellabs/backend/line-finder/constants';
import type {
    LINE_FINDER_MATCH_KIND_VALUE,
    LINE_FINDER_RESULT,
    LINE_FINDER_SPEAKER_VALUE,
} from '@aixellabs/backend/line-finder/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MATCH_LABEL: Record<LINE_FINDER_MATCH_KIND_VALUE, { text: string; className: string }> = {
    [LINE_FINDER_MATCH_KIND.EXACT]: { text: 'Exact', className: 'bg-emerald-600 text-white' },
    [LINE_FINDER_MATCH_KIND.CLOSE]: { text: 'Close', className: 'bg-amber-500 text-black' },
    [LINE_FINDER_MATCH_KIND.SIMILAR]: { text: 'Similar words', className: 'bg-slate-500 text-white' },
};

const SPEAKER_LABEL: Record<LINE_FINDER_SPEAKER_VALUE, string> = {
    [LINE_FINDER_SPEAKER.CONFIRMED]: 'Speaker: Confirmed',
    [LINE_FINDER_SPEAKER.LIKELY]: 'Speaker: Likely',
    [LINE_FINDER_SPEAKER.SOMEONE_ELSE]: 'Speaker: Someone else',
    [LINE_FINDER_SPEAKER.UNSURE]: 'Speaker: Not checked',
    [LINE_FINDER_SPEAKER.NOT_CHECKED]: 'Speaker: Not checked',
};

function clock(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

type LineResultCardProps = {
    result: LINE_FINDER_RESULT;
    isAdmin: boolean;
    onMark: (label: typeof LINE_FINDER_SPEAKER.CONFIRMED | typeof LINE_FINDER_SPEAKER.SOMEONE_ELSE) => void;
};

/** One moment. The player only loads when asked, so a page of results stays fast. */
export function LineResultCard({ result, isAdmin, onMark }: LineResultCardProps) {
    const [playing, setPlaying] = useState(false);
    const match = MATCH_LABEL[result.matchKind];
    const youtubeUrl = `https://www.youtube.com/watch?v=${result.videoId}&t=${result.startSeconds}s`;
    const embedUrl = `https://www.youtube-nocookie.com/embed/${result.videoId}?start=${result.startSeconds}&end=${result.endSeconds}&autoplay=1`;
    const title = result.title ?? result.videoId;

    return (
        <article className="flex flex-col gap-4 rounded-lg border p-4 md:flex-row">
            <div className="aspect-video w-full shrink-0 overflow-hidden rounded-md bg-black md:w-80">
                {playing ? (
                    <iframe
                        allow="autoplay; encrypted-media"
                        allowFullScreen
                        className="size-full"
                        src={embedUrl}
                        title={title}
                    />
                ) : (
                    <button
                        aria-label={`Play this moment from ${title}`}
                        className="group relative size-full"
                        onClick={() => setPlaying(true)}
                        type="button"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnail, not worth optimising */}
                        <img
                            alt=""
                            className="size-full object-cover"
                            loading="lazy"
                            src={`https://i.ytimg.com/vi/${result.videoId}/hqdefault.jpg`}
                        />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/10">
                            <Play className="size-10 fill-white text-white" />
                        </span>
                    </button>
                )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge className={match.className}>{match.text}</Badge>
                    <Badge variant="outline">{SPEAKER_LABEL[result.speaker]}</Badge>
                    {result.saysNo ? <Badge variant="destructive">Says no, may mean the opposite</Badge> : null}
                </div>

                <blockquote className="text-sm">
                    {result.before ? <span className="text-muted-foreground">{result.before} </span> : null}
                    <span className="font-medium">{result.text}</span>
                    {result.after ? <span className="text-muted-foreground"> {result.after}</span> : null}
                </blockquote>

                <p className="text-muted-foreground truncate text-sm" title={title}>
                    {title}
                    {result.views !== null ? ` · ${result.views.toLocaleString('en-IN')} views` : ''}
                </p>

                <p className="text-muted-foreground text-xs">
                    Owned by{' '}
                    {result.channelUrl ? (
                        <a className="underline" href={result.channelUrl} rel="noreferrer" target="_blank">
                            {result.channelName ?? 'this channel'}
                        </a>
                    ) : (
                        (result.channelName ?? 'this channel')
                    )}
                    . Reusing it may get a copyright claim.
                </p>

                <div className={cn('mt-auto flex flex-wrap items-center gap-2 pt-1')}>
                    <Button asChild size="sm">
                        <a href={youtubeUrl} rel="noreferrer" target="_blank">
                            <ExternalLink />
                            Open on YouTube at {clock(result.startSeconds)}
                        </a>
                    </Button>
                    {isAdmin ? (
                        <>
                            <Button onClick={() => onMark(LINE_FINDER_SPEAKER.CONFIRMED)} size="sm" variant="outline">
                                Right person
                            </Button>
                            <Button onClick={() => onMark(LINE_FINDER_SPEAKER.SOMEONE_ELSE)} size="sm" variant="outline">
                                Wrong person
                            </Button>
                        </>
                    ) : null}
                </div>
            </div>
        </article>
    );
}
