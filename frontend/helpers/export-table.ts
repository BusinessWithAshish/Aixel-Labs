import { utils, writeFile, type BookType } from 'xlsx';

export const EXPORT_TABLE_FORMAT = {
    CSV: 'csv',
    XLSX: 'xlsx',
    XLS: 'xls',
    TSV: 'tsv',
    JSON: 'json',
} as const;

export type ExportTableFormat = (typeof EXPORT_TABLE_FORMAT)[keyof typeof EXPORT_TABLE_FORMAT];

export type ExportTableFormatOption = {
    value: ExportTableFormat;
    label: string;
    extension: string;
};

/** Single source of truth for supported table download formats. */
export const EXPORT_TABLE_FORMATS: ExportTableFormatOption[] = [
    { value: EXPORT_TABLE_FORMAT.CSV, label: 'CSV', extension: 'csv' },
    { value: EXPORT_TABLE_FORMAT.XLSX, label: 'Excel (.xlsx)', extension: 'xlsx' },
    { value: EXPORT_TABLE_FORMAT.XLS, label: 'Excel legacy (.xls)', extension: 'xls' },
    { value: EXPORT_TABLE_FORMAT.TSV, label: 'TSV', extension: 'tsv' },
    { value: EXPORT_TABLE_FORMAT.JSON, label: 'JSON', extension: 'json' },
];

const SPREADSHEET_BOOK_TYPE: Record<Exclude<ExportTableFormat, 'json'>, BookType> = {
    csv: 'csv',
    xlsx: 'xlsx',
    xls: 'xls',
    /** SheetJS has no dedicated `tsv` bookType; CSV + tab FS yields TSV. */
    tsv: 'csv',
};

export type DownloadTableRowsOptions = {
    fileName: string;
    format: ExportTableFormat;
    sheetName?: string;
};

function stripExtension(fileName: string): string {
    return fileName.replace(/\.[^.]+$/, '');
}

function extensionFor(format: ExportTableFormat): string {
    return EXPORT_TABLE_FORMATS.find((f) => f.value === format)?.extension ?? format;
}

function downloadBlob(content: BlobPart, fileName: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

/**
 * Download an array of plain row objects as CSV / XLSX / XLS / TSV / JSON.
 * Spreadsheet formats use SheetJS; JSON uses a Blob download.
 */
export function downloadTableRows(
    rows: Record<string, unknown>[],
    { fileName, format, sheetName = 'Sheet1' }: DownloadTableRowsOptions,
): void {
    if (rows.length === 0) {
        throw new Error('Nothing to export');
    }

    const baseName = stripExtension(fileName) || 'download';
    const fullName = `${baseName}.${extensionFor(format)}`;

    if (format === EXPORT_TABLE_FORMAT.JSON) {
        downloadBlob(JSON.stringify(rows, null, 2), fullName, 'application/json;charset=utf-8');
        return;
    }

    const worksheet = utils.json_to_sheet(rows);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31) || 'Sheet1');

    writeFile(workbook, fullName, {
        bookType: SPREADSHEET_BOOK_TYPE[format],
        FS: format === EXPORT_TABLE_FORMAT.TSV ? '\t' : undefined,
    });
}
