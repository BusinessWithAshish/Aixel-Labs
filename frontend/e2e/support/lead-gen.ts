import { expect, type Page } from '@playwright/test';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import type { FACEBOOK_RESPONSE } from '@aixellabs/backend/facebook';
import type { GMAPS_INTERNAL_RESPONSE } from '@aixellabs/backend/gmaps/internal/types';
import type { GSEARCH_RESPONSE } from '@aixellabs/backend/gsearch/types';
import type { INSTAGRAM_RESPONSE } from '@aixellabs/backend/instagram';
import { LINKEDIN_SEARCH_TYPE } from '@aixellabs/backend/linkedin/schemas';
import type { LINKEDIN_BY_COMPANY_RESPONSE } from '@aixellabs/backend/linkedin/types';
import { LEAD_GEN_SCRAPE_API_ROUTE, SubModuleUrls } from '@/config/app-config';

export const GOOGLE_ADVANCED_SEARCH_URL = SubModuleUrls[LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH];
export const LEADS_URL = SubModuleUrls[LEAD_GENERATION_SUB_MODULES.LEADS];

/** `hydrated` is an input React must have attached to before the form can be driven. */
export type LeadGenForm = { subModule: LEAD_GENERATION_SUB_MODULES; title: string; hydrated: string };

export const GOOGLE_ADVANCED_SEARCH_FORM: LeadGenForm = {
    subModule: LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH,
    title: 'Google Advanced Search Form',
    hydrated: '#searchQuery',
};
export const GOOGLE_MAPS_FORM: LeadGenForm = {
    subModule: LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS,
    title: 'Google Maps Form',
    hydrated: '#query',
};
export const INSTAGRAM_FORM: LeadGenForm = {
    subModule: LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH,
    title: 'Instagram Search Form',
    hydrated: '#query',
};
export const FACEBOOK_FORM: LeadGenForm = {
    subModule: LEAD_GENERATION_SUB_MODULES.FACEBOOK,
    title: 'Facebook Pages Form',
    hydrated: '#query',
};
export const LINKEDIN_FORM: LeadGenForm = {
    subModule: LEAD_GENERATION_SUB_MODULES.LINKEDIN,
    title: 'LinkedIn search',
    hydrated: '[id="discovery_filters.company_name"]',
};

/** Search results as the backend product API returns them (`id` is the canonical URL). */
export function searchLeads(count: number): GSEARCH_RESPONSE[] {
    return Array.from({ length: count }, (_, i) => {
        const url = `https://plumber-${i + 1}.example.com/`;
        return {
            id: url,
            index: i + 1,
            title: `Plumber ${i + 1} of Pune`,
            url,
            displayUrl: `plumber-${i + 1}.example.com`,
            formattedUrl: url,
            snippet: `Emergency plumbing services, shop ${i + 1}.`,
        } as GSEARCH_RESPONSE;
    });
}

export function mapsLeads(count: number): GMAPS_INTERNAL_RESPONSE[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `place-${i + 1}`,
        placeId: `place-${i + 1}`,
        name: `Cafe ${i + 1} of Pune`,
        address: `${i + 1} MG Road, Pune`,
        lat: 18.52,
        lng: 73.85,
        phone: null,
        website: null,
        rating: 4.5,
        reviewCount: 120,
        categories: ['Cafe'],
        gmapsUrl: null,
    }));
}

export function instagramLeads(count: number): INSTAGRAM_RESPONSE[] {
    return Array.from(
        { length: count },
        (_, i) =>
            ({
                id: `ig-${i + 1}`,
                username: `pune_baker_${i + 1}`,
                fullName: `Pune Baker ${i + 1}`,
                instagramUrl: `https://www.instagram.com/pune_baker_${i + 1}`,
                followers: 1200,
            }) as INSTAGRAM_RESPONSE,
    );
}

export function facebookLeads(count: number): FACEBOOK_RESPONSE[] {
    return Array.from(
        { length: count },
        (_, i) =>
            ({
                id: `fb-${i + 1}`,
                name: `Pune Dental Clinic ${i + 1}`,
                facebookUrl: `https://www.facebook.com/punedental${i + 1}/`,
                category: 'Dentist & Dental Office',
                phone: '+91 98765 43210',
                emails: [`clinic${i + 1}@example.com`],
                followers: 500,
            }) as FACEBOOK_RESPONSE,
    );
}

export function linkedinCompanyLeads(count: number): LINKEDIN_BY_COMPANY_RESPONSE[] {
    return Array.from(
        { length: count },
        (_, i) =>
            ({
                searchType: LINKEDIN_SEARCH_TYPE.COMPANY,
                id: `company-${i + 1}`,
                name: `Pune Software ${i + 1} Pvt Ltd`,
                url: `https://www.linkedin.com/company/pune-software-${i + 1}`,
                similar_pages: [],
                affiliated_pages: [],
                recent_posts: [],
            }) as unknown as LINKEDIN_BY_COMPANY_RESPONSE,
    );
}

type ScrapeReply = { status?: number; body: { success: boolean; data?: unknown[]; error?: string } };

/**
 * Replaces the scrape BFF in the browser so no test triggers a real scrape. Everything after it
 * (`createUserLeads`: access check, debit, Mongo save) still runs for real on the server.
 * Pass `'hang'` to leave the request in flight.
 */
export async function mockScrape(page: Page, reply: ScrapeReply | 'hang') {
    const requests: unknown[] = [];
    await page.route(`**${LEAD_GEN_SCRAPE_API_ROUTE}`, async (route) => {
        requests.push(route.request().postDataJSON());
        if (reply === 'hang') return;
        await route.fulfill({ status: reply.status ?? 200, json: reply.body });
    });
    return { requests };
}

export async function openLeadGenForm(page: Page, form: LeadGenForm): Promise<void> {
    await page.goto(SubModuleUrls[form.subModule]);
    await expect(page.getByText(form.title, { exact: true })).toBeVisible();
    // The form is server-rendered first; input typed before React attaches its handlers is lost.
    await page.waitForFunction((selector) => {
        const input = document.querySelector(selector);
        return !!input && Object.keys(input).some((key) => key.startsWith('__reactProps'));
    }, form.hydrated);
}

export function openGoogleAdvancedSearch(page: Page): Promise<void> {
    return openLeadGenForm(page, GOOGLE_ADVANCED_SEARCH_FORM);
}

/** Picks from a searchable select, found by the placeholder it shows while empty. */
export async function selectOption(page: Page, placeholder: string, option: string): Promise<void> {
    await page.getByRole('combobox').filter({ hasText: placeholder }).click();
    await page.getByPlaceholder('Search option...').fill(option);
    await page.getByRole('option', { name: option, exact: true }).click();
}

export async function fillRequiredFields(page: Page, values: { query: string; country: string }): Promise<void> {
    await page.getByLabel('Search query').fill(values.query);
    await selectOption(page, 'Select country', values.country);
}

/** Opens the saved list from the leads overview and checks one of its lead cards rendered. */
export async function expectSavedList(
    page: Page,
    list: { presetName: string; leadCount: number; leadText: string },
): Promise<void> {
    await page.goto(LEADS_URL);
    await expect(page.getByText(`${list.leadCount} leads`, { exact: true })).toBeVisible();
    await page.getByText(new RegExp(`^${list.presetName} · `)).click();
    await page.waitForURL(new RegExp(`${LEADS_URL}/[a-f0-9]{24}$`));
    await expect(page.getByText(list.leadText).first()).toBeVisible();
}

/** A preset is required before a run: names the preset in the dialog, then submits. */
export async function saveAndRun(page: Page, presetName: string): Promise<void> {
    await page.getByRole('button', { name: 'Save and Run', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill(presetName);
    await dialog.getByRole('button', { name: 'Save and run', exact: true }).click();
}

/** An invalid form is stopped before the preset dialog, so the highlighted fields stay visible. */
export async function expectRunBlockedByValidation(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Save and Run', exact: true }).click();
    await expect(page.getByText('Please fill in all required fields.')).toBeVisible();
    await expect(page.getByRole('dialog')).toBeHidden();
}

export function creditsBadge(page: Page) {
    return page.getByRole('link', { name: 'View credits in account settings' });
}
