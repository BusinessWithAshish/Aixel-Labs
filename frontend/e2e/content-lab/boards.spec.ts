import type { Locator, Page } from '@playwright/test';
import { ContentLabNodeKind, type ContentLabBoardEdge, type ContentLabBoardNode } from '@aixellabs/backend/db/types';
import { contentLabBoardRoute } from '@/config/app-config';
import type { CONTENT_LAB_WRITE_REQUEST } from '@/helpers/content-lab-api';
import { CONTENT_LAB_BOARD_TEMPLATES } from '@/app/(protected)/content-lab/_constants';
import { USER_STORAGE_STATE } from '../support/env';
import { waitForHydration } from '../support/voice-agents';
import { E2E_USER } from '../support/users';
import {
    BOARDS_URL,
    enableContentLab,
    expect,
    expectNoSidewaysScroll,
    FAKE_BREAKDOWN,
    FAKE_CHECK,
    FAKE_EXPLORE,
    fakeCreator,
    mockContentLabApi,
    test,
    VIEWPORTS,
} from './support-boards';

test.use({ storageState: USER_STORAGE_STATE });

test.beforeEach(async ({ db, lab, context }) => {
    await db.resetUser(E2E_USER);
    await lab.reset(E2E_USER);
    await enableContentLab(context);
});

const template = (id: string) => CONTENT_LAB_BOARD_TEMPLATES.find((item) => item.id === id)!;

/** A box on the canvas or a card in the Flow view, whichever the viewport shows. */
const box = (page: Page, nodeId: string): Locator =>
    page.locator(`[data-testid="board-node"][data-node-id="${nodeId}"], [data-testid="flow-card"][data-node-id="${nodeId}"]`);
const allBoxes = (page: Page) => page.locator('[data-testid="board-node"], [data-testid="flow-card"]');

async function openBoard(page: Page, boardId: string): Promise<void> {
    await page.goto(contentLabBoardRoute(boardId));
    await waitForHydration(page, '[role="toolbar"] button');
}

async function expectSaved(page: Page): Promise<void> {
    await expect(page.getByTestId('save-state')).toHaveText('Saved');
}

/** Ticks or unticks `targetLabel` in the "Connect to…" sheet of `sourceLabel`. */
async function toggleWire(page: Page, sourceLabel: string, targetLabel: string): Promise<void> {
    await page.getByRole('button', { name: `Connect ${sourceLabel} to…` }).first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText(`Connect ${sourceLabel} to…`)).toBeVisible();
    // The label's text, not the checkbox: in dev the Next.js badge covers a checkbox low on the left of a phone screen.
    await sheet.getByText(targetLabel, { exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
}

/** Every kind of input, a Hooks box, one Write fanned out to two Outputs, and a Check on the Reel. */
const RUN_NODES: ContentLabBoardNode[] = [
    { id: 'voice', kind: ContentLabNodeKind.VOICE, x: 0, y: 0, data: {} },
    { id: 'working', kind: ContentLabNodeKind.WORKING, x: 0, y: 230, data: { query: 'protein breakfast', platforms: ['youtube', 'instagram'], country: 'IN' } },
    { id: 'post', kind: ContentLabNodeKind.POST, x: 0, y: 460, data: { url: 'https://youtu.be/p1' } },
    { id: 'ads', kind: ContentLabNodeKind.ADS, x: 0, y: 690, data: { query: 'protein powder', country: 'IN' } },
    { id: 'note', kind: ContentLabNodeKind.NOTE, x: 0, y: 920, data: { text: 'Angle: student budget' } },
    { id: 'hooks', kind: ContentLabNodeKind.HOOKS, x: 320, y: 460, data: {} },
    { id: 'write', kind: ContentLabNodeKind.WRITE, x: 640, y: 460, data: { format: 'reel', language: 'Hinglish' } },
    { id: 'reel', kind: ContentLabNodeKind.OUTPUT, x: 960, y: 230, data: { format: 'reel', text: '' } },
    { id: 'linkedin', kind: ContentLabNodeKind.OUTPUT, x: 960, y: 690, data: { format: 'linkedin-post', text: '' } },
    { id: 'check', kind: ContentLabNodeKind.CHECK, x: 1280, y: 230, data: {} },
];
const wire = (source: string, target: string): ContentLabBoardEdge => ({ id: `${source}->${target}`, source, target });
const RUN_EDGES = [
    wire('working', 'hooks'),
    wire('post', 'hooks'),
    wire('ads', 'hooks'),
    wire('hooks', 'write'),
    wire('voice', 'write'),
    wire('note', 'write'),
    wire('write', 'reel'),
    wire('write', 'linkedin'),
    wire('reel', 'check'),
];

const draftFor = (format: string) => `HOOK: ₹40, 25g protein (${format})\nThe rest of the ${format} draft`;

for (const viewport of VIEWPORTS) {
    test.describe(viewport.name, () => {
        test.use(viewport.use);
        const canvas = viewport.name !== 'mobile';

        test('a new board starts from each template', async ({ page, lab }) => {
            test.slow();
            for (const item of CONTENT_LAB_BOARD_TEMPLATES) {
                await test.step(item.title, async () => {
                    await page.goto(BOARDS_URL);
                    const use = page.getByRole('button', { name: `Use template ${item.title}` });
                    await waitForHydration(page, `[data-testid="template-${item.id}"] button`);
                    await use.click();
                    await page.waitForURL(/\/content-lab\/boards\/[0-9a-f]{24}$/);
                    await expect(allBoxes(page)).toHaveCount(item.nodes.length);
                    await expect(page.getByTestId(canvas ? 'board-canvas' : 'flow-card').first()).toBeVisible();
                    await expectNoSidewaysScroll(page);
                });
            }
            const boards = await lab.listBoards(E2E_USER);
            expect(boards.map((board) => board.templateId)).toEqual(CONTENT_LAB_BOARD_TEMPLATES.map((item) => item.id));
            for (const [index, board] of boards.entries()) {
                expect(board.nodes.map((node) => node.kind)).toEqual(CONTENT_LAB_BOARD_TEMPLATES[index].nodes.map((node) => node.kind));
                expect(board.edges).toHaveLength(CONTENT_LAB_BOARD_TEMPLATES[index].edges.length);
            }

            await page.goto(BOARDS_URL);
            await expect(page.getByTestId('board-card')).toHaveCount(CONTENT_LAB_BOARD_TEMPLATES.length);
            await expectNoSidewaysScroll(page);
        });

        test('a board can be renamed and deleted', async ({ page, lab }) => {
            const { nodes, edges } = template('youtube-script');
            const id = await lab.insertBoard(E2E_USER, { title: 'Old name', templateId: 'youtube-script', nodes, edges });
            await page.goto(BOARDS_URL);
            await waitForHydration(page, '[data-testid="board-card"] button');

            await page.getByRole('button', { name: 'Rename Old name' }).click();
            await page.getByLabel('Name', { exact: true }).fill('Breakfast script');
            await page.getByRole('button', { name: 'Save' }).click();
            await expect(page.getByRole('link', { name: 'Breakfast script' })).toBeVisible();
            await expect.poll(async () => (await lab.getBoard(id))?.title).toBe('Breakfast script');

            await page.getByRole('button', { name: 'Delete Breakfast script' }).click();
            const dialog = page.getByRole('dialog');
            await expect(dialog.getByText('cannot be undone')).toBeVisible();
            await expectNoSidewaysScroll(page);
            await dialog.getByRole('button', { name: 'Delete board' }).click();
            await expect(page.getByText('No boards yet')).toBeVisible();
            expect(await lab.getBoard(id)).toBeNull();
        });

        test('edits autosave and survive a reload', async ({ page, lab }) => {
            const { nodes, edges } = template('reel-from-outliers');
            const id = await lab.insertBoard(E2E_USER, { title: 'Reel board', templateId: 'reel-from-outliers', nodes, edges });
            await openBoard(page, id);
            await expectSaved(page);

            await page.locator('#working-query').fill('hostel cooking');
            await page.locator('#note-text').fill('Keep it under 40 seconds');
            await expect(page.getByTestId('save-state')).toHaveText('Unsaved changes');
            await expectSaved(page);
            await expect
                .poll(async () => (await lab.getBoard(id))?.nodes.find((node) => node.id === 'working')?.data.query)
                .toBe('hostel cooking');

            await page.reload();
            await waitForHydration(page, '[role="toolbar"] button');
            await expect(page.locator('#working-query')).toHaveValue('hostel cooking');
            await expect(page.locator('#note-text')).toHaveValue('Keep it under 40 seconds');
        });

        test('boxes can be added, wired and removed', async ({ page, lab }) => {
            const { nodes, edges } = template('youtube-script');
            const id = await lab.insertBoard(E2E_USER, { title: 'Script board', templateId: 'youtube-script', nodes, edges });
            await openBoard(page, id);

            if (viewport.name === 'desktop') {
                // A real drag from My voice's output handle to the Hooks box's input handle.
                const from = box(page, 'voice').locator('.react-flow__handle.source');
                const to = box(page, 'hooks').locator('.react-flow__handle.target');
                const [a, b] = [await from.boundingBox(), await to.boundingBox()];
                await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
                await page.mouse.down();
                await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2, { steps: 12 });
                await page.mouse.up();
                await expect
                    .poll(async () => (await lab.getBoard(id))?.edges.some((edge) => edge.source === 'voice' && edge.target === 'hooks'))
                    .toBe(true);
            }

            await page.getByRole('button', { name: 'Add box' }).click();
            await page.getByRole('menuitem', { name: /^Note/ }).click();
            const note = page.locator('[data-kind="note"]');
            await expect(note).toHaveCount(1);
            const noteId = (await note.getAttribute('data-node-id'))!;

            await toggleWire(page, 'Note', 'Write');
            if (!canvas) await expect(box(page, noteId).getByTestId('feeds-chip')).toHaveText(['feeds Write']);
            await expect
                .poll(async () => (await lab.getBoard(id))?.edges.some((edge) => edge.source === noteId && edge.target === 'write'))
                .toBe(true);
            await expectNoSidewaysScroll(page);

            await page.getByRole('button', { name: 'Delete Note' }).click();
            await expect(note).toHaveCount(0);
            await expect
                .poll(async () => {
                    const saved = await lab.getBoard(id);
                    return [saved?.nodes.some((node) => node.id === noteId), saved?.edges.some((edge) => edge.source === noteId)];
                })
                .toEqual([false, false]);
        });

        test('Run board fills every box: inputs → hooks → one Write into two Outputs → check', async ({ page, lab }) => {
            await lab.setProfile(E2E_USER, { handles: { youtube: 'mykitchenlab' } });
            const id = await lab.insertBoard(E2E_USER, { title: 'Run board', nodes: RUN_NODES, edges: RUN_EDGES });
            const calls = await mockContentLabApi(page, {
                explore: () => FAKE_EXPLORE,
                breakdown: () => FAKE_BREAKDOWN,
                creator: ({ handle }) => fakeCreator(handle, [1.2, 0.8]),
                ads: () => ({ available: false, ads: [] }),
                write: (body) => ({ text: body.mode === 'draft' ? draftFor(body.format) : '' }),
                check: () => FAKE_CHECK,
                delayMs: 150,
            });
            await openBoard(page, id);

            if (!canvas) {
                // Flow view: inputs first, then Hooks, Write, the Outputs, Check.
                const kinds = await page.getByTestId('flow-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-kind')));
                expect(kinds.slice(5)).toEqual(['hooks', 'write', 'output', 'output', 'check']);
                expect(new Set(kinds.slice(0, 5))).toEqual(new Set(['voice', 'working', 'post', 'ads', 'note']));
                await expect(box(page, 'write').getByTestId('feeds-chip')).toHaveText(['feeds Output · Reel', 'feeds Output · LinkedIn post']);
            }

            await page.getByRole('button', { name: 'Run board' }).click();
            await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
            await expect(page.getByRole('button', { name: 'Run board' })).toBeVisible({ timeout: 30_000 });

            for (const node of RUN_NODES) await expect(box(page, node.id)).toHaveAttribute('data-status', 'done');
            await expect(box(page, 'ads')).toContainText('Ad library not connected yet');
            await expect(box(page, 'working')).toContainText('14.1x');
            await expect(box(page, 'hooks')).toContainText('of 4 open with a number');
            await expect(box(page, 'hooks')).toContainText('CTA: “Comment PLAN”');
            await expect(page.locator('#reel-draft')).toHaveValue(draftFor('reel'));
            await expect(page.locator('#linkedin-draft')).toHaveValue(draftFor('linkedin-post'));
            await expect(box(page, 'check')).toContainText('81/100');
            await expect(box(page, 'check')).toContainText('Number in hook');

            // One write per Output, each in its own format, with everything wired into Write.
            const writes = calls.WRITE.map((request) => request.postDataJSON() as Extract<CONTENT_LAB_WRITE_REQUEST, { mode: 'draft' }>);
            expect(writes.map((body) => [body.mode, body.format, body.language])).toEqual([
                ['draft', 'reel', 'Hinglish'],
                ['draft', 'linkedin-post', 'Hinglish'],
            ]);
            const { context } = writes[0];
            expect(context.topic).toBe('protein breakfast');
            expect(context.note).toBe('Angle: student budget');
            expect(context.voice).toContain('mykitchenlab post 0');
            expect(context.examples?.map((example) => example.title)).toEqual(
                expect.arrayContaining(['I tried 30 days of protein breakfasts', 'Why your gym diet is failing']),
            );
            expect(context.patterns?.length).toBeGreaterThan(2);
            expect(calls.CREATOR.map((request) => request.postDataJSON().handle)).toEqual(['mykitchenlab']);
            expect(calls.CHECK.map((request) => request.postDataJSON())).toEqual([
                expect.objectContaining({ text: 'HOOK: ₹40, 25g protein (reel)', platform: 'instagram', query: 'protein breakfast' }),
            ]);

            // Drafts are saved with the board; results are not.
            await expectSaved(page);
            await expect
                .poll(async () => (await lab.getBoard(id))?.nodes.filter((node) => node.kind === 'output').map((node) => node.data.text))
                .toEqual([draftFor('reel'), draftFor('linkedin-post')]);
            await expectNoSidewaysScroll(page);
        });

        if (!canvas) {
            test('Flow view: wires edited from the sheet, and the canvas is one tap away', async ({ page, lab }) => {
                const { nodes, edges } = template('repurpose');
                const id = await lab.insertBoard(E2E_USER, { title: 'Repurpose', templateId: 'repurpose', nodes, edges });
                await openBoard(page, id);

                await expect(page.getByTestId('flow-card')).toHaveCount(nodes.length);
                await expect(box(page, 'write').getByTestId('feeds-chip')).toHaveCount(4);

                await toggleWire(page, 'Write', 'Output · X thread');
                await expect(box(page, 'write').getByTestId('feeds-chip')).toHaveCount(3);
                await expect.poll(async () => (await lab.getBoard(id))?.edges.some((edge) => edge.target === 'x')).toBe(false);

                await toggleWire(page, 'Write', 'Output · X thread');
                await expect(box(page, 'write').getByTestId('feeds-chip')).toHaveCount(4);
                await expect.poll(async () => (await lab.getBoard(id))?.edges.some((edge) => edge.target === 'x')).toBe(true);

                await page.getByRole('radio', { name: 'Canvas' }).click();
                await expect(page.getByTestId('board-canvas')).toBeVisible();
                await expect(page.getByTestId('board-node')).toHaveCount(nodes.length);
                await expectNoSidewaysScroll(page);
                await page.getByRole('radio', { name: 'Flow' }).click();
                await expect(page.getByTestId('flow-card')).toHaveCount(nodes.length);
            });
        }
    });
}
