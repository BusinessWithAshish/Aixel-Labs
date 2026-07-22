'use client';

import { Button } from '@/components/ui/button';
import { columnKeysFromRows } from '@/helpers/export-table';
import { cn } from '@/lib/utils';
import jspreadsheet from 'jspreadsheet-ce';
import { ArrowLeftRight, ChevronLeft, ChevronRight, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from 'react';
import { toast } from 'sonner';
import { RenameColumnDialog } from './RenameColumnDialog';
import 'jspreadsheet-ce/dist/jspreadsheet.css';
import 'jsuites/dist/jsuites.css';

export type SpreadsheetDataEditorHandle = {
    getRows: () => Record<string, unknown>[];
};

export type SpreadsheetDataEditorProps = {
    rows: Record<string, unknown>[];
    className?: string;
};

type Worksheet = ReturnType<typeof jspreadsheet>[number];

const DELETED_CELL_STYLE =
    'color:#dc2626;text-decoration:line-through;background-color:rgba(220,38,38,0.08)';

function cellToValue(value: unknown): string | number | boolean | null {
    if (value == null || value === '') return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    return String(value);
}

function toGrid(rows: Record<string, unknown>[], keys: string[]): (string | number | boolean)[][] {
    if (rows.length === 0) return [keys.map(() => '')];
    return rows.map((row) => keys.map((key) => cellToValue(row[key]) ?? ''));
}

function headerList(worksheet: Worksheet): string[] {
    const headers = worksheet.getHeaders(true);
    return Array.isArray(headers) ? headers.map((h) => String(h ?? '')) : [];
}

function paintColumnClasses(host: HTMLElement, worksheet: Worksheet, deleted: Set<string>, selectedCol: number | null) {
    const headers = headerList(worksheet);
    const data = worksheet.getData(false, true) as unknown[][];
    const styles: Record<string, string> = {};
    const resets: Record<string, true> = {};

    headers.forEach((header, x) => {
        const marked = deleted.has(header);
        for (let y = 0; y < data.length; y++) {
            const cell = jspreadsheet.helpers.getCellNameFromCoords(x, y);
            if (marked) styles[cell] = DELETED_CELL_STYLE;
            else resets[cell] = true;
        }
    });

    if (Object.keys(resets).length) worksheet.resetStyle(resets, true);
    if (Object.keys(styles).length) worksheet.setStyle(styles, null, null, true);

    host.querySelectorAll<HTMLElement>('.jexcel td[data-x]').forEach((td) => {
        const x = Number(td.dataset.x);
        if (!Number.isFinite(x) || headers[x] == null) return;
        td.classList.toggle('export-col-deleted', deleted.has(headers[x]));
        td.classList.toggle('export-col-selected', selectedCol === x);
    });
}

function selectColumn(worksheet: Worksheet, col: number) {
    worksheet.updateSelectionFromCoords(col, null);
}

export const SpreadsheetDataEditor = forwardRef<
    SpreadsheetDataEditorHandle,
    SpreadsheetDataEditorProps
>(function SpreadsheetDataEditor({ rows, className }, ref) {
    const rootRef = useRef<HTMLDivElement>(null);
    const hostRef = useRef<HTMLDivElement>(null);
    const worksheetRef = useRef<Worksheet | null>(null);
    const deletedRef = useRef<Set<string>>(new Set());
    const selectedColRef = useRef<number | null>(null);
    const renameOpenRef = useRef(false);

    const [selectedCol, setSelectedCol] = useState<number | null>(null);
    const [colCount, setColCount] = useState(0);
    const [deletedHeaders, setDeletedHeaders] = useState<Set<string>>(() => new Set());
    const [renameOpen, setRenameOpen] = useState(false);
    const [renameInitial, setRenameInitial] = useState('');

    const setCol = useCallback((col: number | null) => {
        selectedColRef.current = col;
        setSelectedCol(col);
    }, []);

    const syncMeta = useCallback(() => {
        const worksheet = worksheetRef.current;
        if (!worksheet) {
            setColCount(0);
            return;
        }
        setColCount(headerList(worksheet).length);
    }, []);

    const refreshLook = useCallback(
        (nextDeleted = deletedRef.current, col = selectedColRef.current) => {
            const host = hostRef.current;
            const worksheet = worksheetRef.current;
            if (!host || !worksheet) return;
            paintColumnClasses(host, worksheet, nextDeleted, col);
        },
        [],
    );

    const commitDeleted = useCallback(
        (next: Set<string>) => {
            deletedRef.current = next;
            setDeletedHeaders(next);
            refreshLook(next);
        },
        [refreshLook],
    );

    useImperativeHandle(ref, () => ({
        getRows: () => {
            const worksheet = worksheetRef.current;
            if (!worksheet) return [];

            const headers = headerList(worksheet);
            const data = worksheet.getData(false, true) as (string | number | boolean | null)[][];
            const deleted = deletedRef.current;

            return data
                .filter((row) => row.some((cell) => cell != null && cell !== ''))
                .map((row) => {
                    const out: Record<string, unknown> = {};
                    headers.forEach((header, i) => {
                        const key = header.trim();
                        if (!key || deleted.has(header)) return;
                        out[key] = cellToValue(row[i]);
                    });
                    return out;
                });
        },
    }));

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;

        host.innerHTML = '';
        deletedRef.current = new Set();
        setDeletedHeaders(new Set());
        setCol(null);

        const keys = columnKeysFromRows(rows);
        const columns = (keys.length > 0 ? keys : ['A']).map((key) => ({
            type: 'text' as const,
            title: key,
            width: Math.min(220, Math.max(100, key.length * 10)),
        }));

        const worksheets = jspreadsheet(host, {
            worksheets: [
                {
                    data: toGrid(rows, keys.length > 0 ? keys : ['A']),
                    columns,
                    tableOverflow: true,
                    tableWidth: '100%',
                    tableHeight: '100%',
                    columnDrag: true,
                    columnResize: true,
                    columnSorting: false,
                    allowDeleteColumn: false,
                    allowInsertColumn: true,
                    allowDeleteRow: true,
                    allowInsertRow: true,
                    allowRenameColumn: false,
                },
            ],
            onselection: (_instance, x1) => {
                const col = typeof x1 === 'number' ? x1 : null;
                setCol(col);
                refreshLook(deletedRef.current, col);
            },
            onblur: (instance) => {
                requestAnimationFrame(() => {
                    if (renameOpenRef.current) return;
                    const col = selectedColRef.current;
                    const root = rootRef.current;
                    if (col == null) return;
                    if (root?.contains(document.activeElement)) {
                        selectColumn(instance, col);
                        refreshLook();
                        return;
                    }
                    setCol(null);
                    refreshLook(deletedRef.current, null);
                });
            },
        });

        worksheetRef.current = worksheets[0] ?? null;
        syncMeta();

        return () => {
            worksheetRef.current = null;
            try {
                jspreadsheet.destroy(host as never, true);
            } catch {
                host.innerHTML = '';
            }
        };
    }, [rows, syncMeta, setCol, refreshLook]);

    useEffect(() => {
        const onPointerDown = (event: PointerEvent) => {
            if (renameOpenRef.current) return;
            const root = rootRef.current;
            if (!root || root.contains(event.target as Node)) return;
            if (selectedColRef.current == null) return;
            setCol(null);
            refreshLook(deletedRef.current, null);
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => document.removeEventListener('pointerdown', onPointerDown, true);
    }, [setCol, refreshLook]);

    useEffect(() => {
        renameOpenRef.current = renameOpen;
    }, [renameOpen]);

    const requireColumn = () => {
        const worksheet = worksheetRef.current;
        if (!worksheet || selectedCol == null) {
            toast.error('Select a column first');
            return null;
        }
        return { worksheet, col: selectedCol, header: headerList(worksheet)[selectedCol] ?? '' };
    };

    const moveColumn = (delta: -1 | 1) => {
        const ctx = requireColumn();
        if (!ctx) return;
        const dest = ctx.col + delta;
        if (dest < 0 || dest >= colCount) return;
        ctx.worksheet.moveColumn(ctx.col, dest);
        setCol(dest);
        selectColumn(ctx.worksheet, dest);
        syncMeta();
        refreshLook(deletedRef.current, dest);
    };

    const toggleDeleteColumn = () => {
        const ctx = requireColumn();
        if (!ctx || !ctx.header) return;

        const next = new Set(deletedRef.current);
        if (next.has(ctx.header)) {
            next.delete(ctx.header);
        } else {
            const active = headerList(ctx.worksheet).filter((h) => h && !next.has(h)).length;
            if (active <= 1) {
                toast.error('Keep at least one column');
                return;
            }
            next.add(ctx.header);
        }
        commitDeleted(next);
        selectColumn(ctx.worksheet, ctx.col);
        refreshLook(next, ctx.col);
    };

    const openRename = () => {
        const ctx = requireColumn();
        if (!ctx) return;
        setRenameInitial(ctx.header);
        setRenameOpen(true);
    };

    const confirmRename = (trimmed: string) => {
        const ctx = requireColumn();
        if (!ctx) return;
        const current = ctx.header;
        ctx.worksheet.setHeader(ctx.col, trimmed);
        if (deletedRef.current.has(current)) {
            const next = new Set(deletedRef.current);
            next.delete(current);
            next.add(trimmed);
            commitDeleted(next);
        }
        selectColumn(ctx.worksheet, ctx.col);
        syncMeta();
        refreshLook(deletedRef.current, ctx.col);
        setRenameOpen(false);
    };

    const worksheet = worksheetRef.current;
    const selectedHeader =
        selectedCol != null && worksheet ? (headerList(worksheet)[selectedCol] ?? '') : '';
    const selectedDeleted = Boolean(selectedHeader && deletedHeaders.has(selectedHeader));
    const activeCount = colCount - deletedHeaders.size;

    return (
        <div ref={rootRef} className={cn('flex h-full min-h-0 flex-col gap-2', className)}>
            <div className="flex flex-wrap items-center gap-1.5 shrink-0 px-1 pt-1">
                <span className="text-muted-foreground mr-1 flex items-center gap-1 text-xs">
                    <ArrowLeftRight className="size-3.5" />
                    Column
                </span>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2"
                    disabled={selectedCol == null || selectedCol <= 0}
                    onClick={() => moveColumn(-1)}
                >
                    <ChevronLeft className="size-3.5" />
                    Move left
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2"
                    disabled={selectedCol == null || selectedCol >= colCount - 1}
                    onClick={() => moveColumn(1)}
                >
                    Move right
                    <ChevronRight className="size-3.5" />
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2"
                    disabled={selectedCol == null}
                    onClick={openRename}
                >
                    <Pencil className="size-3.5" />
                    Rename
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                        'h-7 gap-1 px-2',
                        selectedDeleted ? 'text-foreground' : 'text-destructive hover:text-destructive',
                    )}
                    disabled={selectedCol == null || (!selectedDeleted && activeCount <= 1)}
                    onClick={toggleDeleteColumn}
                >
                    {selectedDeleted ? (
                        <>
                            <RotateCcw className="size-3.5" />
                            Restore
                        </>
                    ) : (
                        <>
                            <Trash2 className="size-3.5" />
                            Delete
                        </>
                    )}
                </Button>
                <span
                    className={cn(
                        'ml-auto text-xs',
                        selectedDeleted ? 'text-destructive font-medium' : 'text-muted-foreground',
                    )}
                >
                    {selectedCol == null
                        ? 'Click a column header or cell to select'
                        : selectedDeleted
                          ? `Column ${selectedCol + 1} marked for removal — skipped on download`
                          : `Selected column ${selectedCol + 1} of ${colCount}`}
                </span>
            </div>
            <div
                ref={hostRef}
                className={cn(
                    'min-h-0 flex-1 overflow-auto [&_.jexcel]:relative [&_.jexcel_content]:overflow-auto',
                    '[&_td.export-col-deleted]:text-destructive [&_td.export-col-deleted]:line-through [&_td.export-col-deleted]:bg-destructive/10',
                    '[&_td.export-col-selected]:bg-primary/10 [&_thead_td.export-col-selected]:bg-primary/20 [&_thead_td.export-col-selected]:font-semibold',
                )}
            />

            <RenameColumnDialog
                open={renameOpen}
                onOpenChange={setRenameOpen}
                initialName={renameInitial}
                onConfirm={confirmRename}
            />
        </div>
    );
});
