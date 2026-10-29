'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { ContentLabNodeKind, type ContentLabBoardEdge, type ContentLabBoardNode } from '@aixellabs/backend/db/types';
import { getContentLabBoard, saveContentLabBoard } from '@/app/actions/content-lab-actions';
import { generateLocalStorageKey } from '@/helpers/generate-local-storage-key';

export type BoardGraph = { nodes: ContentLabBoardNode[]; edges: ContentLabBoardEdge[] };
export type BoardSaveState = 'saved' | 'unsaved' | 'saving' | 'error' | 'offline' | 'conflict';
/** After a conflict: keep my edits but take the new drafts, take the board as it is now, or save mine over it. */
export type BoardConflictChoice = 'merge' | 'latest' | 'overwrite';

/** Edits kept in this browser until they are saved, so a reload, crash or lost connection loses nothing. */
type BoardDraft = BoardGraph & {
    /** When the draft was last written. */
    savedAt: string;
    /** The board's `updatedAt` the edits started from: older than the server's means it changed meanwhile. */
    baseUpdatedAt: string;
};

export type PendingDraft = BoardDraft & { boardChangedSince: boolean };

const DRAFT_WRITE_MS = 400;

const draftKey = (boardId: string) => generateLocalStorageKey('content-lab', 'board-draft', boardId);

function readDraft(boardId: string): BoardDraft | null {
    try {
        const raw = window.localStorage.getItem(draftKey(boardId));
        const draft = raw ? (JSON.parse(raw) as BoardDraft) : null;
        return draft && Array.isArray(draft.nodes) && Array.isArray(draft.edges) ? draft : null;
    } catch {
        return null;
    }
}

function writeDraft(boardId: string, draft: BoardDraft): void {
    try {
        window.localStorage.setItem(draftKey(boardId), JSON.stringify(draft));
    } catch {
        // Storage full or blocked: the edits are still on screen; Save works as usual.
    }
}

function clearDraft(boardId: string): void {
    try {
        window.localStorage.removeItem(draftKey(boardId));
    } catch {
        // Nothing to clear.
    }
}

const subscribeOnline = (onChange: () => void) => {
    window.addEventListener('online', onChange);
    window.addEventListener('offline', onChange);
    return () => {
        window.removeEventListener('online', onChange);
        window.removeEventListener('offline', onChange);
    };
};

/** `navigator.onLine`, kept current by the online/offline events (true on the server). */
function useOnline(): boolean {
    return useSyncExternalStore(
        subscribeOnline,
        () => navigator.onLine,
        () => true,
    );
}

const sameGraph = (a: BoardGraph, b: BoardGraph) => JSON.stringify([a.nodes, a.edges]) === JSON.stringify([b.nodes, b.edges]);

/**
 * My edits on top of the board as it is now: everything stays mine, except an Output's draft I did
 * not touch since my last save, which takes the new text (e.g. what a scheduled run just wrote).
 */
export function mergeNewDrafts(mine: BoardGraph, base: BoardGraph, latest: BoardGraph): BoardGraph {
    const baseText = new Map(base.nodes.map((node) => [node.id, node.data.text ?? '']));
    const latestText = new Map(latest.nodes.map((node) => [node.id, node.data.text ?? '']));
    return {
        edges: mine.edges,
        nodes: mine.nodes.map((node) => {
            if (node.kind !== ContentLabNodeKind.OUTPUT || !latestText.has(node.id)) return node;
            const untouched = (node.data.text ?? '') === (baseText.get(node.id) ?? '');
            return untouched ? { ...node, data: { ...node.data, text: latestText.get(node.id) } } : node;
        }),
    };
}

type UseBoardSaveInput = {
    boardId: string;
    /** The board as the server last sent it. */
    initial: BoardGraph & { updatedAt: string };
    /** The graph on screen right now (read at save time, not on every keystroke). */
    getGraph: () => BoardGraph;
    /** Replaces the graph on screen (restoring a draft, resolving a conflict). */
    applyGraph: (graph: BoardGraph) => void;
};

/**
 * Explicit saving for a board: edits apply on screen at once and are saved only by Save (or Ctrl/Cmd+S).
 * Until then they are kept as a local draft (offered back after a reload), leaving the page warns,
 * an offline browser is told it is offline, and a failed save keeps the edits and offers Retry.
 * A save only lands on the version the edits started from; if the board changed meanwhile (a
 * scheduled run wrote drafts, another tab saved) it is a conflict the user resolves.
 */
export function useBoardSave({ boardId, initial, getGraph, applyGraph }: UseBoardSaveInput) {
    const [revision, setRevision] = useState(0);
    const [savedRevision, setSavedRevision] = useState(0);
    const revisionRef = useRef(0);
    const [saving, setSaving] = useState(false);
    const savingRef = useRef(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    /** Set when the last save was refused because the board changed since: its current `updatedAt`. */
    const [conflict, setConflict] = useState<{ updatedAt: string } | null>(null);
    const [lastSavedAt, setLastSavedAt] = useState(initial.updatedAt);
    const baseUpdatedAtRef = useRef(initial.updatedAt);
    /** The board as last loaded or saved here, to tell which drafts the user has since edited. */
    const baseGraphRef = useRef<BoardGraph>({ nodes: initial.nodes, edges: initial.edges });
    const [pendingDraft, setPendingDraft] = useState<PendingDraft | null>(null);
    const online = useOnline();
    const dirty = revision !== savedRevision;

    /** Every edit that should be saved calls this (not selection or measuring). */
    const markChanged = useCallback(() => {
        revisionRef.current += 1;
        setRevision(revisionRef.current);
    }, []);

    // A draft left from last time (reload, crash, closed tab) that differs from the saved board.
    const initialRef = useRef(initial);
    useEffect(() => {
        const draft = readDraft(boardId);
        if (!draft) return;
        if (sameGraph(draft, initialRef.current)) {
            clearDraft(boardId);
            return;
        }
        setPendingDraft({ ...draft, boardChangedSince: draft.baseUpdatedAt !== initialRef.current.updatedAt });
    }, [boardId]);

    // Keep the unsaved edits in this browser, a moment after typing stops. Not while an older draft
    // waits to be restored or discarded: that would overwrite it before the user chose.
    useEffect(() => {
        if (!dirty || pendingDraft) return;
        const timer = setTimeout(
            () => writeDraft(boardId, { ...getGraph(), savedAt: new Date().toISOString(), baseUpdatedAt: baseUpdatedAtRef.current }),
            DRAFT_WRITE_MS,
        );
        return () => clearTimeout(timer);
    }, [boardId, dirty, revision, getGraph, pendingDraft]);

    const persist = useCallback(
        async (graph: BoardGraph, overwrite = false) => {
            if (savingRef.current) return;
            if (!navigator.onLine) {
                toast.error('You are offline. Your edits are kept here; save once you are back online.');
                return;
            }
            const rev = revisionRef.current;
            savingRef.current = true;
            setSaving(true);
            setSaveError(null);
            let error: string | null = null;
            let result: Awaited<ReturnType<typeof saveContentLabBoard>>['data'];
            try {
                const response = await saveContentLabBoard(boardId, graph, { baseUpdatedAt: baseUpdatedAtRef.current, overwrite });
                if (response.success && response.data) result = response.data;
                else error = response.error ?? 'Could not save the board';
            } catch {
                error = 'Could not reach the server';
            }
            savingRef.current = false;
            setSaving(false);
            if (!result) {
                setSaveError(error);
                toast.error(`${error}. Your edits are kept here.`, { action: { label: 'Retry', onClick: () => void persist(getGraph()) } });
                return;
            }
            if (result.status === 'conflict') {
                // Nothing was saved; the edits stay on screen and in the local draft.
                setConflict({ updatedAt: result.updatedAt });
                return;
            }
            setConflict(null);
            baseUpdatedAtRef.current = result.updatedAt;
            baseGraphRef.current = graph;
            setLastSavedAt(result.updatedAt);
            setSavedRevision(rev);
            setPendingDraft(null);
            // Edits made while saving stay as a draft until the next save.
            if (revisionRef.current === rev) clearDraft(boardId);
        },
        [boardId, getGraph],
    );

    const save = useCallback(() => persist(getGraph()), [persist, getGraph]);

    /** After a conflict: merge in the new drafts and save, take the board as it is now, or save mine over it. */
    const resolveConflict = useCallback(
        async (choice: BoardConflictChoice) => {
            if (choice === 'overwrite') return persist(getGraph(), true);
            const response = await getContentLabBoard(boardId).catch(() => null);
            if (!response?.success || !response.data) {
                toast.error(response?.error ?? 'Could not load the board. Try again.');
                return;
            }
            const latest: BoardGraph = { nodes: response.data.nodes, edges: response.data.edges };
            baseUpdatedAtRef.current = response.data.updatedAt;
            setConflict(null);
            if (choice === 'latest') {
                applyGraph(latest);
                baseGraphRef.current = latest;
                setLastSavedAt(response.data.updatedAt);
                setSavedRevision(revisionRef.current);
                clearDraft(boardId);
                return;
            }
            const merged = mergeNewDrafts(getGraph(), baseGraphRef.current, latest);
            applyGraph(merged);
            markChanged();
            await persist(merged);
        },
        [boardId, persist, getGraph, applyGraph, markChanged],
    );

    // Ctrl/Cmd+S saves.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 's') {
                event.preventDefault();
                void save();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [save]);

    // Leaving with unsaved edits: the browser's own prompt for reloads/closing, a confirm for in-app links.
    useEffect(() => {
        if (!dirty) return;
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        const onClick = (event: MouseEvent) => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
            if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
            const url = new URL(anchor.href, window.location.href);
            if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
            if (!window.confirm('This board has unsaved changes. Leave without saving? (They stay in this browser as a draft.)')) {
                event.preventDefault();
                event.stopPropagation();
            }
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        document.addEventListener('click', onClick, true);
        return () => {
            window.removeEventListener('beforeunload', onBeforeUnload);
            document.removeEventListener('click', onClick, true);
        };
    }, [dirty]);

    // Back online with unsaved edits: say so, with the Save one tap away.
    const wasOnline = useRef(online);
    useEffect(() => {
        if (online && !wasOnline.current && dirty) {
            toast.info('Back online. Save your changes?', { action: { label: 'Save', onClick: () => void save() } });
        }
        wasOnline.current = online;
    }, [online, dirty, save]);

    const restoreDraft = useCallback(() => {
        if (!pendingDraft) return;
        applyGraph({ nodes: pendingDraft.nodes, edges: pendingDraft.edges });
        baseUpdatedAtRef.current = pendingDraft.baseUpdatedAt;
        setPendingDraft(null);
        markChanged();
    }, [pendingDraft, applyGraph, markChanged]);

    const discardDraft = useCallback(() => {
        clearDraft(boardId);
        setPendingDraft(null);
    }, [boardId]);

    const saveState: BoardSaveState = saving
        ? 'saving'
        : !dirty
          ? 'saved'
          : !online
            ? 'offline'
            : conflict
              ? 'conflict'
              : saveError
                ? 'error'
                : 'unsaved';

    return {
        saveState,
        dirty,
        online,
        save,
        saveError,
        conflict,
        resolveConflict,
        lastSavedAt,
        markChanged,
        pendingDraft,
        restoreDraft,
        discardDraft,
    };
}

export type UseBoardSaveReturn = ReturnType<typeof useBoardSave>;
