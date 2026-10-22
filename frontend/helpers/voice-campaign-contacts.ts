import { VOICE_CAMPAIGN_LIMITS, VOICE_VARIABLE_NAME_PATTERN } from '@aixellabs/backend/db/types';

/**
 * Campaign contacts from a CSV: parsing, phone numbers to E.164, column mapping, variables.
 * Pure, so the wizard previews exactly what the server action will accept (it runs the same
 * functions again on what it receives).
 */

/** A country numbers without a "+" may be read in: its calling code and national number lengths. */
export type CampaignCountry = {
    code: string;
    name: string;
    dial: string;
    /** Digits of a national (significant) number, without the trunk prefix. */
    lengths: number[];
    /** Dialled before national numbers inside the country ("0" in India, "1" in the US). */
    trunk?: string;
};

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const CAMPAIGN_COUNTRIES: CampaignCountry[] = [
    { code: 'IN', name: 'India', dial: '91', lengths: [10], trunk: '0' },
    { code: 'US', name: 'United States', dial: '1', lengths: [10], trunk: '1' },
    { code: 'CA', name: 'Canada', dial: '1', lengths: [10], trunk: '1' },
    { code: 'GB', name: 'United Kingdom', dial: '44', lengths: [9, 10], trunk: '0' },
    { code: 'AU', name: 'Australia', dial: '61', lengths: [9], trunk: '0' },
    { code: 'AE', name: 'United Arab Emirates', dial: '971', lengths: [8, 9], trunk: '0' },
    { code: 'SA', name: 'Saudi Arabia', dial: '966', lengths: [8, 9], trunk: '0' },
    { code: 'SG', name: 'Singapore', dial: '65', lengths: [8] },
    { code: 'MY', name: 'Malaysia', dial: '60', lengths: [9, 10], trunk: '0' },
    { code: 'PH', name: 'Philippines', dial: '63', lengths: [10], trunk: '0' },
    { code: 'ID', name: 'Indonesia', dial: '62', lengths: range(9, 12), trunk: '0' },
    { code: 'PK', name: 'Pakistan', dial: '92', lengths: [10], trunk: '0' },
    { code: 'BD', name: 'Bangladesh', dial: '880', lengths: [10], trunk: '0' },
    { code: 'NP', name: 'Nepal', dial: '977', lengths: [8, 10], trunk: '0' },
    { code: 'LK', name: 'Sri Lanka', dial: '94', lengths: [9], trunk: '0' },
    { code: 'NZ', name: 'New Zealand', dial: '64', lengths: range(8, 10), trunk: '0' },
    { code: 'IE', name: 'Ireland', dial: '353', lengths: range(7, 9), trunk: '0' },
    { code: 'DE', name: 'Germany', dial: '49', lengths: range(7, 13), trunk: '0' },
    { code: 'FR', name: 'France', dial: '33', lengths: [9], trunk: '0' },
    { code: 'NL', name: 'Netherlands', dial: '31', lengths: [9], trunk: '0' },
    { code: 'ES', name: 'Spain', dial: '34', lengths: [9] },
    { code: 'ZA', name: 'South Africa', dial: '27', lengths: [9], trunk: '0' },
    { code: 'NG', name: 'Nigeria', dial: '234', lengths: [8, 10], trunk: '0' },
    { code: 'KE', name: 'Kenya', dial: '254', lengths: [9], trunk: '0' },
    { code: 'BR', name: 'Brazil', dial: '55', lengths: [10, 11], trunk: '0' },
    { code: 'MX', name: 'Mexico', dial: '52', lengths: [10] },
];

export function campaignCountry(code: string): CampaignCountry | null {
    return CAMPAIGN_COUNTRIES.find((c) => c.code === code) ?? null;
}

/** The country an E.164 number is from, by the longest calling code it starts with (+1 reads as the US). */
export function countryOfE164(e164: string): CampaignCountry | null {
    return (
        [...CAMPAIGN_COUNTRIES]
            .sort((a, b) => b.dial.length - a.dial.length)
            .find((c) => e164.startsWith(`+${c.dial}`)) ?? null
    );
}

/** "+919876543210" -> "+91 98765 43210", "+12025550123" -> "+1 202 555 0123"; unknown codes as they are. */
export function formatPhone(e164: string): string {
    const country = countryOfE164(e164);
    if (!country) return e164;
    const national = e164.slice(country.dial.length + 1);
    const groups =
        country.dial === '1' && national.length === 10
            ? [national.slice(0, 3), national.slice(3, 6), national.slice(6)]
            : [national.slice(0, Math.ceil(national.length / 2)), national.slice(Math.ceil(national.length / 2))];
    return `+${country.dial} ${groups.join(' ')}`;
}

export type PhoneParse = { ok: true; e164: string } | { ok: false; reason: string };

const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * "+91 98765 43210", "098765 43210", "9876543210", "0091-98765-43210" (default India) all read
 * as +919876543210. Without a "+" or "00", the number is read as one of `country`'s: its trunk
 * prefix dropped, or its calling code already in front.
 */
export function normalizePhone(raw: string, country: CampaignCountry): PhoneParse {
    const value = (raw ?? '').trim();
    if (!value) return { ok: false, reason: 'No phone number' };
    if (/[^\d\s+\-().\/]/.test(value)) return { ok: false, reason: 'Not a phone number' };
    const plus = value.startsWith('+');
    let digits = value.replace(/\D/g, '');
    if (!plus && digits.startsWith('00')) digits = digits.slice(2);
    else if (!plus && country.dial === '1' && digits.startsWith('011')) digits = digits.slice(3);
    else if (!plus) {
        const national = country.trunk && digits.startsWith(country.trunk) ? digits.slice(country.trunk.length) : digits;
        if (country.lengths.includes(national.length) && !national.startsWith('0')) {
            digits = country.dial + national;
        } else if (digits.startsWith(country.dial) && country.lengths.includes(digits.length - country.dial.length)) {
            // The calling code is already there, just without the "+".
        } else {
            return { ok: false, reason: `Not a valid number in ${country.name} (add the country code, e.g. +${country.dial})` };
        }
    }
    const e164 = `+${digits}`;
    return E164.test(e164) ? { ok: true, e164 } : { ok: false, reason: 'Too short or too long for a phone number' };
}

/**
 * RFC 4180-style CSV: quoted fields (with "" for a quote and line breaks inside), CRLF or LF, a
 * leading BOM. The delimiter is guessed from the first line (comma, semicolon or tab).
 */
export function parseCsv(text: string): string[][] {
    const src = text.replace(/^﻿/, '');
    const firstLine = src.slice(0, src.search(/\r?\n/) === -1 ? undefined : src.search(/\r?\n/));
    const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length] as const);
    const delimiter = counts.reduce((best, c) => (c[1] > best[1] ? c : best))[0];

    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (quoted) {
            if (ch === '"' && src[i + 1] === '"') {
                field += '"';
                i++;
            } else if (ch === '"') quoted = false;
            else field += ch;
        } else if (ch === '"' && field === '') quoted = true;
        else if (ch === delimiter) {
            row.push(field);
            field = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && src[i + 1] === '\n') i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else field += ch;
    }
    if (field !== '' || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const PHONE_HEADER = /^(phone|phone ?(number|no\.?)|mobile|mobile ?(number|no\.?)|cell|contact ?(number|no\.?)|number|tel(ephone)?|whatsapp)$/i;
const NAME_HEADER = /^(name|full ?name|contact ?name|customer ?name|first ?name|person)$/i;

/** The columns that look like the phone number and the person's name, by their header. */
export function guessColumns(headers: string[]): { phone: number | null; name: number | null } {
    const find = (re: RegExp) => {
        const i = headers.findIndex((h) => re.test(h.trim()));
        return i === -1 ? null : i;
    };
    const phone = find(PHONE_HEADER) ?? find(/phone|mobile/i);
    const name = find(NAME_HEADER);
    return { phone, name: name === phone ? null : name };
}

/** A header as a variable name: "Company Name" -> company_name, "2nd line" -> col_2nd_line. */
export function variableKey(header: string): string {
    const slug = header
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40);
    if (!slug) return 'column';
    return /^[0-9]/.test(slug) ? `col_${slug}` : slug;
}

/** A column's first filled cell and how many contact rows leave it empty (`rows`: header first). */
export function columnFill(rows: string[][], index: number): { sample: string | null; empty: number } {
    const cells = rows.slice(1).map((r) => (r[index] ?? '').trim());
    return { sample: cells.find(Boolean) ?? null, empty: cells.filter((c) => !c).length };
}

/** Variable names for the extra columns, unique (a repeated header gets _2, _3...). */
export function variableKeys(headers: string[], skip: (number | null)[]): { index: number; key: string; header: string }[] {
    const used = new Set<string>(['name', 'phone']);
    const out: { index: number; key: string; header: string }[] = [];
    headers.forEach((header, index) => {
        if (skip.includes(index)) return;
        const base = variableKey(header || `column ${index + 1}`);
        let key = base;
        for (let n = 2; used.has(key); n++) key = `${base}_${n}`;
        used.add(key);
        out.push({ index, key, header });
    });
    return out.slice(0, VOICE_CAMPAIGN_LIMITS.maxVariables);
}

/** One contact as the wizard sends it: the raw phone, the name, the extra columns by variable name. */
export type CampaignContactInput = {
    /** The CSV row (1 = the header). */
    row: number;
    phone: string;
    name: string | null;
    variables: Record<string, string>;
};

export type CampaignContactReady = Omit<CampaignContactInput, 'phone'> & { phone: string };

export type CampaignContactsCheck = {
    contacts: CampaignContactReady[];
    invalid: { row: number; value: string; reason: string }[];
    duplicates: { row: number; phone: string; firstRow: number }[];
};

/** Normalises every phone, drops repeats (first row wins) and keeps the rest's reasons. */
export function checkContacts(
    inputs: CampaignContactInput[],
    country: CampaignCountry,
    seen: Map<string, number> = new Map(),
): CampaignContactsCheck {
    const result: CampaignContactsCheck = { contacts: [], invalid: [], duplicates: [] };
    for (const input of inputs) {
        const parsed = normalizePhone(input.phone, country);
        if (!parsed.ok) {
            result.invalid.push({ row: input.row, value: input.phone, reason: parsed.reason });
            continue;
        }
        const first = seen.get(parsed.e164);
        if (first !== undefined) {
            result.duplicates.push({ row: input.row, phone: parsed.e164, firstRow: first });
            continue;
        }
        seen.set(parsed.e164, input.row);
        const variables: Record<string, string> = {};
        for (const [key, value] of Object.entries(input.variables ?? {})) {
            if (!VOICE_VARIABLE_NAME_PATTERN.test(key)) continue;
            const text = String(value ?? '').trim().slice(0, VOICE_CAMPAIGN_LIMITS.maxVariableLength);
            if (text) variables[key] = text;
        }
        const name = (input.name ?? '').trim().slice(0, 120) || null;
        result.contacts.push({ row: input.row, phone: parsed.e164, name, variables });
    }
    return result;
}

/** CSV rows (header first) as contact inputs, by the chosen columns. */
export function rowsToContactInputs(
    rows: string[][],
    mapping: { phone: number; name: number | null },
    variables: { index: number; key: string }[],
): CampaignContactInput[] {
    return rows.slice(1).map((cells, i) => ({
        row: i + 2,
        phone: cells[mapping.phone] ?? '',
        name: mapping.name === null ? null : (cells[mapping.name] ?? '').trim() || null,
        variables: Object.fromEntries(variables.map((v) => [v.key, (cells[v.index] ?? '').trim()])),
    }));
}
