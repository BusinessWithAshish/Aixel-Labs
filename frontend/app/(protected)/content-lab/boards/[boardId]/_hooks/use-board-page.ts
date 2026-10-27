'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
    type Connection,
    type Edge,
    type Node,
    type OnEdgesChange,
    type OnNodesChange,
    type XYPosition,
} from '@xyflow/react';
import {
    ContentLabNodeKind,
    type ContentLabBoard,
    type ContentLabBoardEdge,
    type ContentLabBoardNode,
    type ContentLabNodeData,
    type ContentLabProfile,
} from '@aixellabs/backend/db/types';
import { saveContentLabBoard } from '@/app/actions/content-lab-actions';
import { useIsMobile } from '@/hooks/use-mobile';
import { copyToClipboard } from '@/lib/clipboard';
import { CONTENT_LAB_FORMAT_LABELS, CONTENT_LAB_NODE_META } from '../../../_constants';
import { flowOrder, wouldCycle } from '../_utils/graph';
import { runBoard, type BoardNodeRun } from '../_utils/run-board';

export type BoardFlowNode = Node<{ kind: ContentLabNodeKind; settings: ContentLabNodeData }, 'board'>;
export type BoardPageData = { board: ContentLabBoard; profile: ContentLabProfile };
export type BoardSaveState = 'saved' | 'unsaved' | 'saving' | 'error';

const AUTOSAVE_MS = 700;
/** Only the box's header drags it, so its fields stay usable (and scrollable on touch). */
export const NODE_DRAG_HANDLE = '.board-node-drag';

const toFlowNode = (node: ContentLabBoardNode): BoardFlowNode => ({
    id: node.id,
    type: 'board',
    position: { x: node.x, y: node.y },
    dragHandle: NODE_DRAG_HANDLE,
    data: { kind: node.kind, settings: node.data },
});

const toBoardNode = (node: BoardFlowNode): ContentLabBoardNode => ({
    id: node.id,
    kind: node.data.kind,
    x: Math.round(node.position.x),
    y: Math.round(node.position.y),
    data: node.data.settings,
});

const toEdge = (edge: ContentLabBoardEdge): Edge => ({ id: edge.id, source: edge.source, target: edge.target });

function defaultSettings(kind: ContentLabNodeKind, profile: ContentLabProfile): ContentLabNodeData {
    switch (kind) {
        case ContentLabNodeKind.WORKING:
            return { query: '', platforms: ['youtube', 'instagram'], country: profile.country };
        case ContentLabNodeKind.CREATOR:
            return { platform: 'youtube', handle: '' };
        case ContentLabNodeKind.POST:
            return { url: '' };
        case ContentLabNodeKind.ADS:
            return { query: '', country: profile.country };
        case ContentLabNodeKind.NOTE:
            return { text: '' };
        case ContentLabNodeKind.WRITE:
            return { format: 'reel', language: profile.language };
        case ContentLabNodeKind.OUTPUT:
            return { format: 'reel', text: '' };
        default:
            return {};
    }
}

/** "Output · Reel", "What's working", … */
export function nodeLabel(kind: ContentLabNodeKind, settings: ContentLabNodeData): string {
    const base = CONTENT_LAB_NODE_META[kind].label;
    return kind === ContentLabNodeKind.OUTPUT && settings.format ? `${base} · ${CONTENT_LAB_FORMAT_LABELS[settings.format]}` : base;
}

/**
 * One board: boxes and wires (React Flow state), autosaved; per-box run results (not saved);
 * Run / Stop; add, connect, disconnect, delete; the Flow view (phones) or the canvas.
 */
export function useBoardPage({ board, profile }: BoardPageData) {
    const [nodes, setNodes] = useState<BoardFlowNode[]>(() => board.nodes.map(toFlowNode));
    const [edges, setEdges] = useState<Edge[]>(() => board.edges.map(toEdge));
    const [runs, setRuns] = useState<Record<string, BoardNodeRun>>({});
    const [running, setRunning] = useState(false);
    /** The box whose "Connect to…" sheet is open. */
    const [connecting, setConnecting] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const isMobile = useIsMobile();
    const [viewChoice, setViewChoice] = useState<'flow' | 'canvas' | null>(null);
    const view = viewChoice ?? (isMobile ? 'flow' : 'canvas');

    // ── Autosave ────────────────────────────────────────────────────────────
    const graph = useMemo(
        () => ({
            nodes: nodes.map(toBoardNode),
            edges: edges.map(({ id, source, target }) => ({ id, source, target })),
        }),
        [nodes, edges],
    );
    const snapshot = useMemo(() => JSON.stringify(graph), [graph]);
    const savedRef = useRef(snapshot);
    const latestRef = useRef(snapshot);
    latestRef.current = snapshot;
    const [saveState, setSaveState] = useState<BoardSaveState>('saved');

    useEffect(() => {
        if (snapshot === savedRef.current) return;
        setSaveState('unsaved');
        const timer = setTimeout(async () => {
            setSaveState('saving');
            const response = await saveContentLabBoard(board._id!, JSON.parse(snapshot));
            if (!response.success) {
                setSaveState('error');
                toast.error(response.error ?? 'Could not save the board');
                return;
            }
            savedRef.current = snapshot;
            setSaveState(latestRef.current === snapshot ? 'saved' : 'unsaved');
        }, AUTOSAVE_MS);
        return () => clearTimeout(timer);
    }, [snapshot, board._id]);

    // ── Editing ─────────────────────────────────────────────────────────────
    const onNodesChange: OnNodesChange<BoardFlowNode> = useCallback(
        (changes) => setNodes((current) => applyNodeChanges(changes, current)),
        [],
    );
    const onEdgesChange: OnEdgesChange = useCallback((changes) => setEdges((current) => applyEdgeChanges(changes, current)), []);

    const canConnect = useCallback(
        (source: string, target: string) => {
            const targetNode = nodes.find((node) => node.id === target);
            const sourceNode = nodes.find((node) => node.id === source);
            if (!targetNode || !sourceNode) return false;
            if (!CONTENT_LAB_NODE_META[sourceNode.data.kind].givesOutput || !CONTENT_LAB_NODE_META[targetNode.data.kind].acceptsInput) {
                return false;
            }
            return !wouldCycle(edges, source, target);
        },
        [nodes, edges],
    );

    const connect = useCallback(
        (source: string, target: string) => {
            if (edges.some((edge) => edge.source === source && edge.target === target)) return;
            if (!canConnect(source, target)) {
                toast.error('Those boxes cannot be wired that way');
                return;
            }
            setEdges((current) => addEdge({ id: `${source}->${target}`, source, target }, current));
        },
        [edges, canConnect],
    );

    const onConnect = useCallback((connection: Connection) => connect(connection.source, connection.target), [connect]);

    const disconnect = useCallback(
        (source: string, target: string) =>
            setEdges((current) => current.filter((edge) => !(edge.source === source && edge.target === target))),
        [],
    );

    const updateSettings = useCallback((id: string, patch: Partial<ContentLabNodeData>) => {
        setNodes((current) =>
            current.map((node) => (node.id === id ? { ...node, data: { ...node.data, settings: { ...node.data.settings, ...patch } } } : node)),
        );
    }, []);

    const addNode = useCallback(
        (kind: ContentLabNodeKind, position?: XYPosition) => {
            const id = `${kind}-${Math.random().toString(36).slice(2, 8)}`;
            setNodes((current) => {
                const rightmost = current.reduce((max, node) => Math.max(max, node.position.x), -320);
                const at = position ?? { x: rightmost + 320, y: 0 };
                return [...current, toFlowNode({ id, kind, x: at.x, y: at.y, data: defaultSettings(kind, profile) })];
            });
            return id;
        },
        [profile],
    );

    const removeNode = useCallback((id: string) => {
        setNodes((current) => current.filter((node) => node.id !== id));
        setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id));
        setRuns((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));
    }, []);

    // ── Run ─────────────────────────────────────────────────────────────────
    const run = useCallback(async () => {
        const controller = new AbortController();
        abortRef.current = controller;
        setRunning(true);
        setRuns({});
        try {
            await runBoard({
                nodes: graph.nodes,
                edges: graph.edges,
                profile,
                signal: controller.signal,
                onNode: (id, result) => setRuns((current) => ({ ...current, [id]: result })),
                onOutputText: (id, text) => updateSettings(id, { text }),
            });
        } finally {
            setRunning(false);
            abortRef.current = null;
        }
    }, [graph, profile, updateSettings]);

    const stop = useCallback(() => abortRef.current?.abort(), []);
    useEffect(() => () => abortRef.current?.abort(), []);

    const copyOutput = useCallback(
        (id: string) => {
            const text = nodes.find((node) => node.id === id)?.data.settings.text ?? '';
            void copyToClipboard(text, { successMessage: 'Draft copied' });
        },
        [nodes],
    );

    const ordered = useMemo(() => flowOrder(graph.nodes, graph.edges), [graph]);

    return {
        board,
        profile,
        nodes,
        edges,
        ordered,
        onNodesChange,
        onEdgesChange,
        onConnect,
        connect,
        disconnect,
        connecting,
        setConnecting,
        canConnect,
        updateSettings,
        addNode,
        removeNode,
        runs,
        running,
        run,
        stop,
        copyOutput,
        saveState,
        view,
        setView: setViewChoice,
    };
}

export type UseBoardPageReturn = ReturnType<typeof useBoardPage>;
