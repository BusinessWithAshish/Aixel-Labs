'use client';

import { useState, type DragEvent } from 'react';
import Link from 'next/link';
import {
    ArrowRight,
    Braces,
    CheckCircle2,
    CircleAlert,
    Columns3,
    Copy,
    FileSpreadsheet,
    Phone,
    UploadCloud,
    User,
    Users,
    X,
} from 'lucide-react';
import { VOICE_CAMPAIGN_LIMITS } from '@aixellabs/backend/db/types';
import { SettingsSection } from '@/components/common/SettingsSection';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePage } from '@/contexts/PageStore';
import { CAMPAIGN_COUNTRIES, formatPhone, normalizePhone } from '@/helpers/voice-campaign-contacts';
import { voiceAgentUrl } from '@/helpers/voice-routes';
import { cn } from '@/lib/utils';
import type { CsvColumn, UseNewCampaignPageReturn } from '../_hooks/use-new-campaign-page';

const NONE = 'none';
const PREVIEW_ROWS = 5;
const ISSUES_SHOWN = 50;
const PHONE_EXAMPLES = 4;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

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
                    The first row names the columns. You need one column of phone numbers; a name column is optional. Any
                    other column (company, city, plan…) is something the agent can mention on the call.
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

function FileBar() {
    const { csv, clearFile } = usePage<UseNewCampaignPageReturn>();
    if (!csv) return null;
    return (
        <div className="bg-muted/40 flex items-center justify-between gap-3 rounded-lg border p-3">
            <span className="flex min-w-0 items-center gap-2 text-sm">
                <FileSpreadsheet className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <span className="truncate font-medium" data-testid="campaign-csv-name">
                    {csv.fileName}
                </span>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                    {plural(csv.rows.length - 1, 'row')} · {plural(csv.headers.length, 'column')}
                </span>
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={clearFile}>
                <X className="size-4" />
                Change file
            </Button>
        </div>
    );
}

function ColumnSelect({
    id,
    label,
    hint,
    value,
    onChange,
    optional,
}: {
    id: string;
    label: string;
    hint: string;
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
            <span className="text-muted-foreground text-xs">{hint}</span>
        </div>
    );
}

/** What happens to a column's empty cells, in words. */
function emptyNote(column: CsvColumn, defaults: Map<string, string>): string | null {
    if (!column.empty) return null;
    const empty = `${plural(column.empty, 'row')} empty`;
    if (column.use === 'phone') return `${empty}: those rows are skipped`;
    const fallback = defaults.get(column.use === 'name' ? 'name' : (column.key ?? ''));
    if (column.use === 'name')
        return `${empty}: ${fallback ? `called “${fallback}” instead` : 'the agent goes without a name'}`;
    if (column.use === 'variable')
        return `${empty}: ${fallback ? `the agent’s default “${fallback}” is used` : 'left blank'}`;
    return null;
}

function ColumnUse({ column }: { column: CsvColumn }) {
    switch (column.use) {
        case 'phone':
            return (
                <span className="inline-flex items-center gap-1.5 font-medium">
                    <Phone className="size-3.5" aria-hidden />
                    Phone number
                </span>
            );
        case 'name':
            return (
                <span className="inline-flex items-center gap-1.5 font-medium">
                    <User className="size-3.5" aria-hidden />
                    Name <span className="text-muted-foreground font-mono text-xs font-normal">{'{{name}}'}</span>
                </span>
            );
        case 'variable':
            return (
                <Badge variant="secondary" className="font-mono">
                    {`{{${column.key}}}`}
                </Badge>
            );
        default:
            return (
                <span className="text-muted-foreground">
                    Not used (at most {VOICE_CAMPAIGN_LIMITS.maxVariables} extra columns)
                </span>
            );
    }
}

function ColumnMatching() {
    const { csv, columns, mapping, setMapping, promptVariables } = usePage<UseNewCampaignPageReturn>();
    if (!csv) return null;
    const defaults = new Map(promptVariables.map((v) => [v.name, v.value]));

    return (
        <SettingsSection
            titleId="campaign-columns-heading"
            icon={Columns3}
            title="Match your columns"
            description={
                mapping.phone === null
                    ? 'We could not tell which column holds the phone numbers. Pick it below.'
                    : 'We matched them by their headers: a column called Phone, Mobile or Number holds the phone numbers, one called Name or Full name holds the name. Change either below if we got it wrong. Every other column is handed to the agent as a {{variable}}.'
            }
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <ColumnSelect
                    id="campaign-phone-column"
                    label="Phone number (needed)"
                    hint="The number each contact is called on."
                    value={mapping.phone}
                    onChange={(phone) => setMapping((m) => ({ phone, name: m.name === phone ? null : m.name }))}
                />
                <ColumnSelect
                    id="campaign-name-column"
                    label="Name (optional)"
                    hint="So the agent can greet people by name."
                    optional
                    value={mapping.name}
                    onChange={(name) => setMapping((m) => ({ ...m, name: name === m.phone ? null : name }))}
                />
            </div>
            <Table data-testid="campaign-variables" aria-label="Your columns and what they become">
                <TableHeader>
                    <TableRow>
                        <TableHead>Your column</TableHead>
                        <TableHead>Example</TableHead>
                        <TableHead>Becomes</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {columns.map((column) => {
                        const note = emptyNote(column, defaults);
                        return (
                            <TableRow key={column.index}>
                                <TableCell className="max-w-40 truncate font-medium">{column.header}</TableCell>
                                <TableCell className="text-muted-foreground max-w-48 truncate">
                                    {column.sample ?? 'All empty'}
                                </TableCell>
                                <TableCell className="whitespace-normal">
                                    <div className="flex flex-col gap-0.5">
                                        <ColumnUse column={column} />
                                        {note ? <span className="text-muted-foreground text-xs">{note}</span> : null}
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </SettingsSection>
    );
}

function PhoneFormat() {
    const { csv, mapping, country, setCountry, countryInfo } = usePage<UseNewCampaignPageReturn>();
    if (!csv || mapping.phone === null) return null;
    const phone = mapping.phone;
    const examples = csv.rows
        .slice(1)
        .map((cells, i) => ({ row: i + 2, raw: (cells[phone] ?? '').trim() }))
        .filter((e) => e.raw)
        .slice(0, PHONE_EXAMPLES)
        .map((e) => ({ ...e, parsed: normalizePhone(e.raw, countryInfo) }));

    return (
        <SettingsSection
            titleId="campaign-phone-heading"
            icon={Phone}
            title="How phone numbers are read"
            description={`Spaces, dashes and brackets are dropped. A number starting with + or 00 keeps its own country code. Any other number is read as a ${countryInfo.name} number: ${countryInfo.trunk ? `a leading ${countryInfo.trunk} is dropped and ` : ''}+${countryInfo.dial} goes in front.`}
        >
            <div className="flex max-w-xs flex-col gap-1.5">
                <Label htmlFor="campaign-country">Numbers without a country code are in</Label>
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
            <ul
                className="divide-y rounded-lg border text-sm"
                aria-label="Phone numbers before and after"
                data-testid="campaign-phone-examples"
            >
                {examples.map((e) => (
                    <li key={e.row} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2">
                        <span className="text-muted-foreground w-14 shrink-0 text-xs tabular-nums">Row {e.row}</span>
                        <span className="tabular-nums">{e.raw}</span>
                        <ArrowRight className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                        {e.parsed.ok ? (
                            <span className="font-medium tabular-nums">{formatPhone(e.parsed.e164)}</span>
                        ) : (
                            <span className="text-destructive">Skipped: {e.parsed.reason}</span>
                        )}
                    </li>
                ))}
            </ul>
        </SettingsSection>
    );
}

function ReadyToCall() {
    const { check } = usePage<UseNewCampaignPageReturn>();
    if (!check) return null;
    const issues = [
        ...check.invalid.map((i) => ({
            row: i.row,
            text: `${i.value || '(empty)'}: ${i.reason}`,
            kind: 'invalid' as const,
        })),
        ...check.duplicates.map((d) => ({
            row: d.row,
            text: `${formatPhone(d.phone)} is already on row ${d.firstRow}: called once`,
            kind: 'duplicate' as const,
        })),
    ].sort((a, b) => a.row - b.row);

    return (
        <SettingsSection titleId="campaign-ready-heading" icon={Users} title="Who will be called">
            <div className="flex flex-wrap gap-2" data-testid="campaign-csv-summary">
                <Badge variant="green" className="gap-1">
                    <CheckCircle2 className="size-3.5" aria-hidden />
                    <span data-testid="csv-ready">{check.contacts.length.toLocaleString()}</span> ready to call
                </Badge>
                {check.duplicates.length ? (
                    <Badge variant="yellow" className="gap-1">
                        <Copy className="size-3.5" aria-hidden />
                        <span data-testid="csv-duplicates">{check.duplicates.length.toLocaleString()}</span>{' '}
                        {check.duplicates.length === 1 ? 'repeat' : 'repeats'} skipped
                    </Badge>
                ) : null}
                {check.invalid.length ? (
                    <Badge variant="red" className="gap-1">
                        <CircleAlert className="size-3.5" aria-hidden />
                        <span data-testid="csv-invalid">{check.invalid.length.toLocaleString()}</span> without a usable
                        number
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
                <ul
                    className="divide-y rounded-lg border text-sm"
                    aria-label="Contacts preview"
                    data-testid="campaign-csv-preview"
                >
                    {check.contacts.slice(0, PREVIEW_ROWS).map((c) => (
                        <li key={c.row} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2">
                            <span className="font-medium">{c.name ?? 'No name'}</span>
                            <span className="tabular-nums">{formatPhone(c.phone)}</span>
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
            ) : null}
        </SettingsSection>
    );
}

function VariablesForAgent() {
    const { agent, check, mapping, variables, promptVariables, unfilledVariables } = usePage<UseNewCampaignPageReturn>();
    if (!agent || !check) return null;
    const first = check.contacts[0];
    const values = first
        ? [
              ...(mapping.name !== null && first.name ? [['name', first.name] as const] : []),
              ...Object.entries(first.variables),
          ].slice(0, 4)
        : [];
    const inPrompt = new Set(promptVariables.map((v) => v.name));
    const notInPrompt = variables.filter((v) => !inPrompt.has(v.key));
    const code = (key: string) => <code className="bg-muted rounded px-1 font-mono text-xs">{`{{${key}}}`}</code>;
    const example = variables[0] ?? { key: 'company', header: 'company' };

    return (
        <SettingsSection
            titleId="campaign-agent-variables-heading"
            icon={Braces}
            title="What the agent knows about each contact"
            description={
                <>
                    Wherever {agent.name}’s prompt says {code(example.key)}, each call puts in that contact’s value from the
                    “{example.header}” column. An empty cell uses the default set on the agent, or nothing.
                </>
            }
        >
            {values.length ? (
                <div className="bg-muted/30 flex flex-col gap-1.5 rounded-lg border p-3 text-sm">
                    <span className="text-muted-foreground text-xs">The call to row {first.row} gets</span>
                    <ul className="flex flex-wrap gap-x-4 gap-y-1">
                        {values.map(([key, value]) => (
                            <li key={key} className="flex min-w-0 items-center gap-1.5">
                                {code(key)}
                                <ArrowRight className="text-muted-foreground size-3 shrink-0" aria-hidden />
                                <span className="truncate">{value}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
            {unfilledVariables.length ? (
                <Alert data-testid="campaign-unfilled-variables">
                    <CircleAlert className="size-4" />
                    <AlertDescription>
                        <p>
                            {agent.name}’s prompt uses{' '}
                            {unfilledVariables.map((v, i) => (
                                <span key={v.name}>
                                    {i ? ', ' : ''}
                                    {code(v.name)}
                                    {v.value ? ` (default “${v.value}”)` : ''}
                                </span>
                            ))}
                            , but no column fills {unfilledVariables.length === 1 ? 'it' : 'them'}. Every call gets the
                            default, or nothing where there is none. Add a column with that header to fill it per contact.
                        </p>
                    </AlertDescription>
                </Alert>
            ) : null}
            {notInPrompt.length ? (
                <p className="text-muted-foreground text-sm">
                    {notInPrompt.map((v, i) => (
                        <span key={v.key}>
                            {i ? ', ' : ''}
                            {code(v.key)}
                        </span>
                    ))}{' '}
                    {notInPrompt.length === 1 ? 'is' : 'are'} not in the prompt yet, so the agent will not mention{' '}
                    {notInPrompt.length === 1 ? 'it' : 'them'}.{' '}
                    <Link
                        href={voiceAgentUrl(agent.id)}
                        className="text-primary underline-offset-4 hover:underline"
                        target="_blank"
                    >
                        Edit {agent.name}
                    </Link>{' '}
                    to use them.
                </p>
            ) : null}
        </SettingsSection>
    );
}

export function StepContacts() {
    const { csv } = usePage<UseNewCampaignPageReturn>();
    if (!csv) return <DropZone />;
    return (
        <div className="flex flex-col gap-6">
            <FileBar />
            <ColumnMatching />
            <PhoneFormat />
            <ReadyToCall />
            <VariablesForAgent />
        </div>
    );
}
