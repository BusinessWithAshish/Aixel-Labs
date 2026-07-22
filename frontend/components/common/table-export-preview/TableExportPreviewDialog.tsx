'use client';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    downloadTableRows,
    EXPORT_TABLE_FORMAT,
    EXPORT_TABLE_FORMATS,
    type ExportTableFormat,
} from '@/helpers/export-table';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    SpreadsheetDataEditor,
    type SpreadsheetDataEditorHandle,
} from './SpreadsheetDataEditor';

export type TableExportPreviewDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    rows: Record<string, unknown>[];
    fileName: string;
    defaultFormat?: ExportTableFormat;
    sheetName?: string;
};

export function TableExportPreviewDialog({
    open,
    onOpenChange,
    rows,
    fileName,
    defaultFormat = EXPORT_TABLE_FORMAT.XLSX,
    sheetName = 'Sheet1',
}: TableExportPreviewDialogProps) {
    const editorRef = useRef<SpreadsheetDataEditorHandle>(null);
    const [format, setFormat] = useState<ExportTableFormat>(defaultFormat);

    useEffect(() => {
        if (open) setFormat(defaultFormat);
    }, [open, defaultFormat]);

    const handleDownload = () => {
        try {
            const edited = editorRef.current?.getRows() ?? [];
            downloadTableRows(edited, { fileName, format, sheetName });
            toast.success(`Downloaded ${edited.length} row(s)`);
            onOpenChange(false);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to download');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[90vh] max-h-[90vh] w-[95vw] max-w-[95vw] flex-col gap-3 overflow-hidden p-4 sm:max-w-[95vw]">
                <DialogHeader className="shrink-0 space-y-1 pr-8">
                    <DialogTitle>Export preview</DialogTitle>
                    <DialogDescription>
                        Edit the table, then download. Marked columns stay visible but are skipped in
                        the file.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">Download as</span>
                    <Select value={format} onValueChange={(v) => setFormat(v as ExportTableFormat)}>
                        <SelectTrigger className="w-48" size="sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {EXPORT_TABLE_FORMATS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="bg-muted text-muted-foreground rounded-md px-2.5 py-1 text-xs">
                        <span className="text-foreground font-medium">File type only.</span> CSV,
                        Excel, and JSON share this same table — the dropdown does not change what you
                        see.
                    </p>
                    <span className="text-muted-foreground ml-auto text-sm tabular-nums">
                        {rows.length} row{rows.length === 1 ? '' : 's'}
                    </span>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden rounded-md border [&_*]:pointer-events-auto">
                    {open ? <SpreadsheetDataEditor ref={editorRef} rows={rows} className="h-full" /> : null}
                </div>

                <DialogFooter className="shrink-0">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                    <Button type="button" onClick={handleDownload}>
                        Download
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
