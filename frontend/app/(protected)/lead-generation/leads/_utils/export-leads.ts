import type { Lead } from '@aixellabs/backend/db/types';
import {
    downloadTableRows,
    EXPORT_TABLE_FORMATS,
    type ExportTableFormat,
} from '@/helpers/export-table';

export type LeadExportFormat = ExportTableFormat;

/** UI labels for lead export — backed by the shared table-export format SSOT. */
export const LEAD_EXPORT_FORMATS = EXPORT_TABLE_FORMATS;

function cellValue(value: unknown): string | number | boolean | null {
    if (value == null) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return '';
        if (value.every((v) => v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
            return value.filter((v) => v != null).map(String).join(', ');
        }
        return JSON.stringify(value);
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return String(value);
}

/** Flatten nested plain objects with dot keys; arrays / deep objects become strings. */
function flattenObject(value: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
    if (value == null) {
        if (prefix) out[prefix] = null;
        return out;
    }

    if (Array.isArray(value) || typeof value !== 'object') {
        if (prefix) out[prefix] = cellValue(value);
        return out;
    }

    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
        if (prefix) out[prefix] = '';
        return out;
    }

    for (const [key, nested] of entries) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (
            nested != null &&
            typeof nested === 'object' &&
            !Array.isArray(nested) &&
            Object.keys(nested as object).length > 0
        ) {
            flattenObject(nested, path, out);
        } else {
            out[path] = cellValue(nested);
        }
    }

    return out;
}

export function flattenLeadForExport(lead: Lead): Record<string, unknown> {
    return {
        _id: lead._id ?? null,
        source: lead.source,
        sourceId: lead.sourceId,
        ...flattenObject(lead.data),
    };
}

export function exportLeads(
    leads: Lead[],
    format: LeadExportFormat,
    fileName = `leads-${new Date().toISOString().slice(0, 10)}`,
): void {
    const rows = leads.map(flattenLeadForExport);
    downloadTableRows(rows, { fileName, format, sheetName: 'Leads' });
}
