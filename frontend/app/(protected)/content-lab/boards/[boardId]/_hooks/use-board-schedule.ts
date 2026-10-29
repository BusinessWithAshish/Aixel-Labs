'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type { ContentLabBoardRun, ContentLabBoardSchedule } from '@aixellabs/backend/db/types';
import { listContentLabBoardRuns, saveContentLabBoardSchedule } from '@/app/actions/content-lab-actions';
import { DEFAULT_BOARD_SCHEDULE } from '../../_utils/schedule';

type UseBoardScheduleInput = {
    boardId: string;
    schedule: ContentLabBoardSchedule | undefined;
    nextRunAt: string | null;
    runs: ContentLabBoardRun[];
};

/** The board's schedule (saved on its own, straight away) and its scheduled-run history. */
export function useBoardSchedule({ boardId, schedule: initial, nextRunAt: initialNext, runs: initialRuns }: UseBoardScheduleInput) {
    const [open, setOpen] = useState(false);
    const [schedule, setSchedule] = useState<ContentLabBoardSchedule>(initial ?? DEFAULT_BOARD_SCHEDULE);
    const [hasSchedule, setHasSchedule] = useState(!!initial);
    const [nextRunAt, setNextRunAt] = useState(initialNext);
    const [runs, setRuns] = useState(initialRuns);
    const [saving, setSaving] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const save = useCallback(
        async (next: ContentLabBoardSchedule, success: string) => {
            setSaving(true);
            const response = await saveContentLabBoardSchedule(boardId, next).catch(() => null);
            setSaving(false);
            if (!response?.success || !response.data) {
                toast.error(response?.error ?? 'Could not save the schedule. Try again.');
                return false;
            }
            setSchedule(response.data.schedule);
            setNextRunAt(response.data.nextRunAt);
            setHasSchedule(true);
            toast.success(success);
            return true;
        },
        [boardId],
    );

    const setPaused = useCallback(
        (paused: boolean) => save({ ...schedule, paused }, paused ? 'Schedule paused' : 'Schedule resumed'),
        [save, schedule],
    );

    const refresh = useCallback(async () => {
        setRefreshing(true);
        const response = await listContentLabBoardRuns(boardId).catch(() => null);
        setRefreshing(false);
        if (response?.success && response.data) setRuns(response.data);
        else toast.error(response?.error ?? 'Could not load the run history');
    }, [boardId]);

    return { open, setOpen, schedule, hasSchedule, nextRunAt, runs, saving, refreshing, save, setPaused, refresh };
}

export type UseBoardScheduleReturn = ReturnType<typeof useBoardSchedule>;
