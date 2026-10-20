'use client';

import { useState, type DragEvent } from 'react';
import { CheckCircle2, CircleAlert, Copy, FileSpreadsheet, UploadCloud, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePage } from '@/contexts/PageStore';
import { CAMPAIGN_COUNTRIES } from '@/helpers/voice-campaign-contacts';
import { cn } from '@/lib/utils';
import type { UseNewCampaignPageReturn } from '../_hooks/use-new-campaign-page';

const NONE = 'none';
const PREVIEW_ROWS = 5;
const ISSUES_SHOWN = 50;

function DropZone() {
    const { readFile, csvError } = usePage<UseNewCampaignPageReturn>();
    const [dragging, setDragging] = useState(false);
    const onDrop = (e: DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        setDragging(false);
        void readFile(e.dataTransfer.files?.[0]);
    };

    return (
        <div className="flex flex-col gap-2">
            <label
                htmlFor="campaign-csv"
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cn(
                    'hover:bg-muted/50 flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors sm:p-8',
                    dragging && 'border-primary bg-primary/5',
                )}
            >
                <UploadCloud className="text-muted-foreground size-8" aria-hidden />
                <span className="font-medium">Choose a CSV file, or drop it here</span>
                <span className="text-muted-foreground max-w-md text-sm">
                    The first row names the columns. One column holds the phone numbers; a name column is optional. Every
                    other column is kept for each contact and handed to the agent as a variable.
                </span>
                <input
                    id="campaign-csv"
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={(e) => {
                        void readFile(e.target.files?.[0]);
                        e.target.value = '';
                    }}
                />
            </label>
            {csvError ? (
                <Alert variant="destructive">
                    <AlertDescription>{csvError}</AlertDescription>
                </Alert>
            ) : null}
        </div>
    );
}

function ColumnSelect({
    id,
    label,
    value,
    onChange,
    optional,
}: {
    id: string;
    label: string;
    value: number | null;
    onChange: (index: number | null) => void;
    optional?: boolean;
}) {
    const { csv } = usePage<UseNewCampaignPageReturn>();
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Select
                value={value === null ? NONE : String(value)}
                onValueChange={(v) => onChange(v === NONE ? null : Number(v))}
            >
                <SelectTrigger id={id} className="w-full">
                    <SelectValue placeholder="Pick a column" />
                </SelectTrigger>
                <SelectContent>
                    {optional ? <SelectItem value={NONE}>No name column</SelectItem> : null}
                    {csv?.headers.map((header, index) => (
                        <SelectItem key={index} value={String(index)}>
                            {header}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

function Mapping() {
    const { csv, clearFile, mapping, setMapping, country, setCountry, variables } = usePage<UseNewCampaignPageReturn>();
    if (!csv) return null;
    return (
        <div className="flex flex-col gap-4">
            <div className="bg-muted/40 flex items-center justify-between gap-3 rounded-lg border p-3">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                    <FileSpreadsheet className="text-muted-foreground size-4 shrink-0" aria-hidden />
                    <span className="truncate font-medium" data-testid="campaign-csv-name">
                        {csv.fileName}
                    </span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                        {(csv.rows.length - 1).toLocaleString()} rows
                    </span>
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={clearFile}>
                    <X className="size-4" />
                    Change file
                </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
                <ColumnSelect
                    id="campaign-phone-column"
                    label="Phone number column"
                    value={mapping.phone}
                    onChange={(phone) => setMapping((m) => ({ phone, name: m.name === phone ? null : m.name }))}
                />
                <ColumnSelect
                    id="campaign-name-column"
                    label="Name column"
                    optional
                    value={mapping.name}
                    onChange={(name) => setMapping((m) => ({ ...m, name: name === m.phone ? null : name }))}
                />
                <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="campaign-country">Numbers without +</Label>
                    <Select value={country} onValueChange={setCountry}>
                        <SelectTrigger id="campaign-country" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {CAMPAIGN_COUNTRIES.map((c) => (
                                <SelectItem key={c.code} value={c.code}>
                                    {c.name} (+{c.dial})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            {variables.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">Variables for the agent</span>
                    <div className="flex flex-wrap gap-1.5" data-testid="campaign-variables">
                        {variables.map((v) => (
                            <Badge key={v.key} variant="secondary" className="font-mono" title={`From the “${v.header}” column`}>
                                {`{{${v.key}}}`}
                            </Badge>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function Summary() {
    const { check, csv, mapping } = usePage<UseNewCampaignPageReturn>();
    if (!check || !csv || mapping.phone === null) return null;
    const issues = [
        ...check.invalid.map((i) => ({ row: i.row, text: `${i.value || '(empty)'}: ${i.reason}`, kind: 'invalid' as const })),
        ...check.duplicates.map((d) => ({ row: d.row, text: `${d.phone} is already on row ${d.firstRow}`, kind: 'duplicate' as const })),
    ].sort((a, b) => a.row - b.row);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2" data-testid="campaign-csv-summary">
                <Badge variant="green" className="gap-1">
                    <CheckCircle2 className="size-3.5" aria-hidden />
                    <span data-testid="csv-ready">{check.contacts.length.toLocaleString()}</span> ready to call
                </Badge>
                {check.duplicates.length ? (
                    <Badge variant="yellow" className="gap-1">
                        <Copy className="size-3.5" aria-hidden />
                        <span data-testid="csv-duplicates">{check.duplicates.length.toLocaleString()}</span> {check.duplicates.length === 1 ? 'duplicate' : 'duplicates'} skipped
                    </Badge>
                ) : null}
                {check.invalid.length ? (
                    <Badge variant="red" className="gap-1">
                        <CircleAlert className="size-3.5" aria-hidden />
                        <span data-testid="csv-invalid">{check.invalid.length.toLocaleString()}</span> invalid
                    </Badge>
                ) : null}
            </div>

            {issues.length ? (
                <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">Rows that will not be called</span>
                    <ul
                        className="bg-muted/30 max-h-40 divide-y overflow-y-auto rounded-lg border text-sm"
                        aria-label="Rows that will not be called"
                        data-testid="campaign-csv-issues"
                    >
                        {issues.slice(0, ISSUES_SHOWN).map((issue) => (
                            <li key={`${issue.kind}-${issue.row}`} className="flex gap-2 px-3 py-1.5">
                                <span className="text-muted-foreground w-14 shrink-0 tabular-nums">Row {issue.row}</span>
                                <span className="min-w-0 break-words">{issue.text}</span>
                            </li>
                        ))}
                        {issues.length > ISSUES_SHOWN ? (
                            <li className="text-muted-foreground px-3 py-1.5">and {issues.length - ISSUES_SHOWN} more</li>
                        ) : null}
                    </ul>
                </div>
            ) : null}

            {check.contacts.length ? (
                <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">Preview</span>
                    <ul className="divide-y rounded-lg border text-sm" aria-label="Contacts preview" data-testid="campaign-csv-preview">
                        {check.contacts.slice(0, PREVIEW_ROWS).map((c) => (
                            <li key={c.row} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2">
                                <span className="font-medium">{c.name ?? 'No name'}</span>
                                <span className="tabular-nums">{c.phone}</span>
                                {Object.entries(c.variables).length ? (
                                    <span className="text-muted-foreground min-w-0 truncate text-xs">
                                        {Object.entries(c.variables)
                                            .map(([k, v]) => `${k}: ${v}`)
                                            .join(' · ')}
                                    </span>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </div>
    );
}

export function StepContacts() {
    const { csv } = usePage<UseNewCampaignPageReturn>();
    return (
        <div className="flex flex-col gap-4">
            {csv ? (
                <>
                    <Mapping />
                    <Summary />
                </>
            ) : (
                <DropZone />
            )}
        </div>
    );
}
