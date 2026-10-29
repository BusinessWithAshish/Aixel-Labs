'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
    type Connection,
    type Edge,
    type EdgeChange,
    type Node,
    type NodeChange,
    type OnEdgesChange,
    type OnNodesChange,
    type XYPosition,
} from '@xyflow/react';
import {
    ContentLabNodeKind,
    type ContentLabBoard,
    type ContentLabBoardEdge,
    type ContentLabBoardNode,
    type ContentLabBoardRun,
    type ContentLabNodeData,
    type ContentLabProfile,
} from '@aixellabs/backend/db/types';
import { listContentLabWatches } from '@/app/actions/content-lab-actions';
import { contentLabApi } from '@/helpers/content-lab-api';
import { useIsMobile } from '@/hooks/use-mobile';
import { copyToClipboard } from '@/lib/clipboard';
import { CONTENT_LAB_NODE_META } from '../../../_constants';
import { nodeLabel, wireLabel } from '../../_utils/flow';
import { flowOrder, wouldCycle } from '../../_utils/graph';
import { runBoard, type BoardNodeRun, type BoardRunDeps } from '../../_utils/run-board';
import { useBoardSave, type BoardGraph } from './use-board-save';
import { useBoardSchedule } from './use-board-schedule';

export type BoardFlowNode = Node<{ kind: ContentLabNodeKind; settings: ContentLabNodeData }, 'board'>;
export type BoardPageData = { board: ContentLabBoard; profile: ContentLabProfile; runs: ContentLabBoardRun[] };
export type { BoardSaveState } from './use-board-save';

/** Callbacks a node calls. Stable, and passed as props, so typing in one node re-renders only that node. */
export type BoardNodeActions = {
    updateSettings: (id: string, patch: Partial<ContentLabNodeData>) => void;
    removeNode: (id: string) => void;
    connectFrom: (id: string) => void;
    copyText: (text: string) => void;
};

/** What a node shows about its wires and its last run. Rebuilt only when that changes. */
export type NodeView = {
    label: string;
    kind: ContentLabNodeKind;
    run?: BoardNodeRun;
    /** Wires coming in: from which node, carrying what ("12 top posts"). */
    gets: { id: string; label: string; what: string | null }[];
    /** Wires going out. */
    sendsTo: { id: string; label: string }[];
    /** What travels out along its wires: counted after a run. */
    sends: string | null;
};

/** Only the node's header drags it, so its fields stay usable (and scrollable on touch). */
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

/** Changes that alter what gets saved (not selecting or measuring). */
const SAVED_CHANGES = new Set<NodeChange['type'] | EdgeChange['type']>(['position', 'add', 'remove', 'replace']);

/** "Run board" in the browser: the BFF on the signed-in session. */
const BROWSER_RUN_DEPS: BoardRunDeps = { ...contentLabApi, watches: () => listContentLabWatches() };

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

/** A stored run's results, shown in the nodes as if it had just run. */
function runsFrom(run: ContentLabBoardRun | undefined): Record<string, BoardNodeRun> {
    return Object.fromEntries((run?.nodes ?? []).map(({ nodeId, ...result }) => [nodeId, result]));
}

const SEP = '\u0001';
const ROW = '\u0002';

/**
 * One board: nodes and wires (React Flow state) edited locally and saved with Save; per-node run
 * results (from this session's Run, or the last scheduled run); Run / Stop; add, connect,
 * disconnect, delete; the schedule; the Flow view (phones) or the canvas.
 */
export function useBoardPage({ board, profile, runs: history }: BoardPageData) {
    const [nodes, setNodes] = useState<BoardFlowNode[]>(() => board.nodes.map(toFlowNode));
    const [edges, setEdges] = useState<Edge[]>(() => board.edges.map(toEdge));
    const lastScheduled = history.find((run) => run.status !== 'running');
    const [runs, setRuns] = useState<Record<string, BoardNodeRun>>(() => runsFrom(lastScheduled));
    /** Set while the nodes show a scheduled run's results rather than this session's. */
    const [shownRun, setShownRun] = useState<ContentLabBoardRun | null>(lastScheduled ?? null);
    const [running, setRunning] = useState(false);
    /** The node whose "Connect to…" sheet is open. */
    const [connecting, setConnecting] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const isMobile = useIsMobile();
    const [viewChoice, setViewChoice] = useState<'flow' | 'canvas' | null>(null);
    const view = viewChoice ?? (isMobile ? 'flow' : 'canvas');

    // ── Saving ──────────────────────────────────────────────────────────────
    const nodesRef = useRef(nodes);
    nodesRef.current = nodes;
    const edgesRef = useRef(edges);
    edgesRef.current = edges;
    const getGraph = useCallback(
        (): BoardGraph => ({
            nodes: nodesRef.current.map(toBoardNode),
            edges: edgesRef.current.map(({ id, source, target }) => ({ id, source, target })),
        }),
        [],
    );
    const applyGraph = useCallback((graph: BoardGraph) => {
        setNodes(graph.nodes.map(toFlowNode));
        setEdges(graph.edges.map(toEdge));
    }, []);
    const saving = useBoardSave({
        boardId: board._id!,
        initial: { nodes: board.nodes, edges: board.edges, updatedAt: board.updatedAt },
        getGraph,
        applyGraph,
    });
    const { markChanged } = saving;

    const schedule = useBoardSchedule({ boardId: board._id!, schedule: board.schedule, nextRunAt: board.nextRunAt, runs: history });

    // ── Editing ─────────────────────────────────────────────────────────────
    const onNodesChange: OnNodesChange<BoardFlowNode> = useCallback(
        (changes) => {
            setNodes((current) => applyNodeChanges(changes, current));
            if (changes.some((change) => SAVED_CHANGES.has(change.type))) markChanged();
        },
        [markChanged],
    );
    const onEdgesChange: OnEdgesChange = useCallback(
        (changes) => {
            setEdges((current) => applyEdgeChanges(changes, current));
            if (changes.some((change) => SAVED_CHANGES.has(change.type))) markChanged();
        },
        [markChanged],
    );

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
                toast.error('Those nodes cannot be wired that way');
                return;
            }
            setEdges((current) => addEdge({ id: `${source}->${target}`, source, target }, current));
            markChanged();
        },
        [edges, canConnect, markChanged],
    );

    const onConnect = useCallback((connection: Connection) => connect(connection.source, connection.target), [connect]);

    const disconnect = useCallback(
        (source: string, target: string) => {
            setEdges((current) => current.filter((edge) => !(edge.source === source && edge.target === target)));
            markChanged();
        },
        [markChanged],
    );

    const updateSettings = useCallback(
        (id: string, patch: Partial<ContentLabNodeData>) => {
            setNodes((current) =>
                current.map((node) =>
                    node.id === id ? { ...node, data: { ...node.data, settings: { ...node.data.settings, ...patch } } } : node,
                ),
            );
            markChanged();
        },
        [markChanged],
    );

    const addNode = useCallback(
        (kind: ContentLabNodeKind, position?: XYPosition) => {
            const id = `${kind}-${Math.random().toString(36).slice(2, 8)}`;
            setNodes((current) => {
                const rightmost = current.reduce((max, node) => Math.max(max, node.position.x), -320);
                const at = position ?? { x: rightmost + 320, y: 0 };
                return [...current, toFlowNode({ id, kind, x: at.x, y: at.y, data: defaultSettings(kind, profile) })];
            });
            markChanged();
            return id;
        },
        [profile, markChanged],
    );

    const removeNode = useCallback(
        (id: string) => {
            setNodes((current) => current.filter((node) => node.id !== id));
            setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id));
            setRuns((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));
            markChanged();
        },
        [markChanged],
    );

    const copyText = useCallback((text: string) => void copyToClipboard(text, { successMessage: 'Draft copied' }), []);

    const actions = useMemo<BoardNodeActions>(
        () => ({ updateSettings, removeNode, connectFrom: setConnecting, copyText }),
        [updateSettings, removeNode, copyText],
    );

    // ── What each node shows about its wires ────────────────────────────────
    // Keyed on labels only, so typing in a field does not rebuild every node's view.
    const labelsKey = nodes.map((node) => [node.id, node.data.kind, nodeLabel(node.data.kind, node.data.settings)].join(SEP)).join(ROW);
    const viewCache = useRef(new Map<string, { key: string; view: NodeView }>());
    const nodeViews = useMemo(() => {
        const info = new Map(
            labelsKey
                .split(ROW)
                .filter(Boolean)
                .map((row) => {
                    const [id, kind, label] = row.split(SEP);
                    return [id, { kind: kind as ContentLabNodeKind, label }] as const;
                }),
        );
        const views: Record<string, NodeView> = {};
        for (const [id, { kind, label }] of info) {
            const run = runs[id];
            const view: NodeView = {
                label,
                kind,
                run,
                gets: edges
                    .filter((edge) => edge.target === id && info.has(edge.source))
                    .map((edge) => {
                        const source = info.get(edge.source)!;
                        return { id: edge.source, label: source.label, what: wireLabel(source.kind, runs[edge.source]?.sent) };
                    }),
                sendsTo: edges
                    .filter((edge) => edge.source === id && info.has(edge.target))
                    .map((edge) => ({ id: edge.target, label: info.get(edge.target)!.label })),
                sends: wireLabel(kind, run?.sent),
            };
            const key = JSON.stringify([view.label, view.gets, view.sendsTo, view.sends]);
            const cached = viewCache.current.get(id);
            if (cached && cached.key === key && cached.view.run === run) views[id] = cached.view;
            else {
                viewCache.current.set(id, { key, view });
                views[id] = view;
            }
        }
        return views;
    }, [labelsKey, edges, runs]);

    // ── Run ─────────────────────────────────────────────────────────────────
    const run = useCallback(async () => {
        const controller = new AbortController();
        abortRef.current = controller;
        setRunning(true);
        setRuns({});
        setShownRun(null);
        const graph = getGraph();
        try {
            await runBoard({
                ...graph,
                profile,
                deps: BROWSER_RUN_DEPS,
                signal: controller.signal,
                onNode: (id, result) => setRuns((current) => ({ ...current, [id]: result })),
                onOutputText: (id, text) => updateSettings(id, { text }),
            });
        } finally {
            setRunning(false);
            abortRef.current = null;
        }
    }, [getGraph, profile, updateSettings]);

    const stop = useCallback(() => abortRef.current?.abort(), []);
    useEffect(() => () => abortRef.current?.abort(), []);

    /** Shows a scheduled run's results in the nodes and puts its drafts on the board (unsaved until Save). */
    const showScheduledRun = useCallback(
        (scheduled: ContentLabBoardRun) => {
            const ids = new Set(nodesRef.current.map((node) => node.id));
            scheduled.outputs.filter((output) => ids.has(output.nodeId)).forEach((output) => updateSettings(output.nodeId, { text: output.text }));
            setRuns(runsFrom(scheduled));
            setShownRun(scheduled);
        },
        [updateSettings],
    );

    const ordered = useMemo(
        () =>
            flowOrder(
                nodes.map((node) => ({ id: node.id, kind: node.data.kind, y: node.position.y, node })),
                edges,
            ).map((item) => item.node),
        [nodes, edges],
    );

    return {
        board,
        profile,
        nodes,
        edges,
        ordered,
        nodeViews,
        actions,
        getGraph,
        onNodesChange,
        onEdgesChange,
        onConnect,
        connect,
        disconnect,
        connecting,
        setConnecting,
        canConnect,
        addNode,
        runs,
        running,
        run,
        stop,
        shownRun,
        showScheduledRun,
        saving,
        schedule,
        view,
        setView: setViewChoice,
    };
}

export type UseBoardPageReturn = ReturnType<typeof useBoardPage>;
