'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    createContentLabBoard,
    deleteContentLabBoard,
    renameContentLabBoard,
    type ContentLabBoardSummary,
} from '@/app/actions/content-lab-actions';
import { contentLabBoardRoute } from '@/config/app-config';

export type BoardsPageData = { boards: ContentLabBoardSummary[] };

/** Boards list: new board from a template (opens it), rename, delete (confirmed in a dialog). */
export function useBoardsPage({ boards: initial }: BoardsPageData) {
    const router = useRouter();
    const [boards, setBoards] = useState(initial);
    const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);
    const [renaming, setRenaming] = useState<ContentLabBoardSummary | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [deleting, setDeleting] = useState<ContentLabBoardSummary | null>(null);
    const [busy, setBusy] = useState(false);

    const createBoard = async (templateId: string) => {
        setCreatingTemplateId(templateId);
        const response = await createContentLabBoard({ templateId });
        if (!response.success || !response.data) {
            setCreatingTemplateId(null);
            toast.error(response.error ?? 'Could not create the board');
            return;
        }
        router.push(contentLabBoardRoute(response.data.id));
    };

    const openRename = (board: ContentLabBoardSummary) => {
        setRenaming(board);
        setRenameValue(board.title);
    };

    const submitRename = async () => {
        if (!renaming) return;
        setBusy(true);
        const response = await renameContentLabBoard(renaming._id!, renameValue);
        setBusy(false);
        if (!response.success || !response.data) {
            toast.error(response.error ?? 'Could not rename the board');
            return;
        }
        const { title } = response.data;
        setBoards((list) =>
            list.map((board) => (board._id === renaming._id ? { ...board, title, updatedAt: new Date().toISOString() } : board)),
        );
        setRenaming(null);
        toast.success('Board renamed');
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        setBusy(true);
        const response = await deleteContentLabBoard(deleting._id!);
        setBusy(false);
        if (!response.success) {
            toast.error(response.error ?? 'Could not delete the board');
            return;
        }
        setBoards((list) => list.filter((board) => board._id !== deleting._id));
        setDeleting(null);
        toast.success('Board deleted');
    };

    return {
        boards,
        creatingTemplateId,
        createBoard,
        renaming,
        renameValue,
        setRenameValue,
        openRename,
        closeRename: () => setRenaming(null),
        submitRename,
        deleting,
        setDeleting,
        confirmDelete,
        busy,
    };
}

export type UseBoardsPageReturn = ReturnType<typeof useBoardsPage>;
