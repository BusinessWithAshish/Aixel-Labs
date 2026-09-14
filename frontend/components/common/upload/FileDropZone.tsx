'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { AlertCircle, CheckCircle2, RotateCcw, UploadCloud, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { uploadFile, type UploadResult } from '@/lib/upload-client';

const MAX_CONCURRENT_UPLOADS = 2;

type UploadStatus = 'queued' | 'uploading' | 'done' | 'error';

type QueueItem = {
    id: string;
    file: File;
    filename: string;
    status: UploadStatus;
    progress: number;
    error?: string;
    result?: UploadResult;
};

function createId(): string {
    return typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `f_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function createQueueItem(file: File): QueueItem {
    return {
        id: createId(),
        file,
        filename: file.name,
        status: 'queued',
        progress: 0,
    };
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** exponent;
    return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

type FileDropZoneProps = {
    className?: string;
};

export function FileDropZone({ className }: FileDropZoneProps) {
    const [items, setItems] = useState<QueueItem[]>([]);
    const [isDragActive, setIsDragActive] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const inFlightRef = useRef<Set<string>>(new Set());

    const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    }, []);

    const runUpload = useCallback(
        (item: QueueItem) => {
            updateItem(item.id, { status: 'uploading', error: undefined });
            uploadFile(item.file, {
                filename: item.filename,
                onProgress: ({ percent }) => updateItem(item.id, { progress: percent }),
            })
                .then((result) => {
                    updateItem(item.id, { status: 'done', progress: 100, result });
                })
                .catch((error: unknown) => {
                    const message = error instanceof Error ? error.message : 'Upload failed';
                    updateItem(item.id, { status: 'error', error: message });
                })
                .finally(() => {
                    inFlightRef.current.delete(item.id);
                });
        },
        [updateItem],
    );

    // Drains the queue up to MAX_CONCURRENT_UPLOADS whenever the queue changes.
    useEffect(() => {
        const uploadingCount = items.filter((item) => item.status === 'uploading').length;
        let slotsAvailable = MAX_CONCURRENT_UPLOADS - uploadingCount;
        if (slotsAvailable <= 0) return;

        for (const item of items) {
            if (slotsAvailable <= 0) break;
            if (item.status !== 'queued') continue;
            if (inFlightRef.current.has(item.id)) continue;
            inFlightRef.current.add(item.id);
            slotsAvailable -= 1;
            runUpload(item);
        }
    }, [items, runUpload]);

    const addFiles = useCallback((files: FileList | File[]) => {
        const newItems = Array.from(files).map(createQueueItem);
        if (newItems.length === 0) return;
        setItems((prev) => [...prev, ...newItems]);
    }, []);

    const handleDrop = useCallback(
        (event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            setIsDragActive(false);
            if (event.dataTransfer.files?.length) {
                addFiles(event.dataTransfer.files);
            }
        },
        [addFiles],
    );

    const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDragActive(true);
    }, []);

    const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDragActive(false);
    }, []);

    const handleBrowseChange = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            if (event.target.files?.length) {
                addFiles(event.target.files);
            }
            event.target.value = '';
        },
        [addFiles],
    );

    const handleFilenameChange = useCallback((id: string, filename: string) => {
        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, filename } : item)));
    }, []);

    const handleRetry = useCallback((id: string) => {
        setItems((prev) =>
            prev.map((item) => (item.id === id ? { ...item, status: 'queued', error: undefined } : item)),
        );
    }, []);

    const handleRemove = useCallback((id: string) => {
        inFlightRef.current.delete(id);
        setItems((prev) => prev.filter((item) => item.id !== id));
    }, []);

    return (
        <div className={cn('space-y-4', className)}>
            <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                className={cn(
                    'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors',
                    isDragActive
                        ? 'border-primary bg-primary/5'
                        : 'border-muted-foreground/25 hover:border-muted-foreground/50',
                )}
            >
                <UploadCloud className="text-muted-foreground size-8" />
                <p className="text-sm font-medium">Drag and drop files here, or click to browse</p>
                <p className="text-muted-foreground text-xs">Any file type, any size</p>
                <input ref={inputRef} type="file" multiple className="hidden" onChange={handleBrowseChange} />
            </div>

            {items.length > 0 && (
                <div className="space-y-3">
                    {items.map((item) => (
                        <div key={item.id} className="flex flex-col gap-2 rounded-md border p-3">
                            <div className="flex items-center gap-2">
                                <Input
                                    value={item.filename}
                                    disabled={item.status !== 'queued'}
                                    onChange={(event) => handleFilenameChange(item.id, event.target.value)}
                                    className="h-8 flex-1"
                                />
                                <span className="text-muted-foreground w-20 shrink-0 text-right text-xs">
                                    {formatBytes(item.file.size)}
                                </span>
                                {item.status === 'done' && (
                                    <CheckCircle2 className="size-4 shrink-0 text-green-600" />
                                )}
                                {item.status === 'error' && (
                                    <>
                                        <AlertCircle className="text-destructive size-4 shrink-0" />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="size-8"
                                            onClick={() => handleRetry(item.id)}
                                        >
                                            <RotateCcw className="size-4" />
                                        </Button>
                                    </>
                                )}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    onClick={() => handleRemove(item.id)}
                                >
                                    <X className="size-4" />
                                </Button>
                            </div>
                            <Progress value={item.progress} />
                            <div className="text-muted-foreground flex items-center justify-between text-xs">
                                <span className="capitalize">{item.status}</span>
                                {item.status === 'error' && item.error ? (
                                    <span className="text-destructive truncate">{item.error}</span>
                                ) : (
                                    <span>{item.progress}%</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
