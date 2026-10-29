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
    SETTINGS_URL,
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

/** Saves with the toolbar's Save button and waits for it to finish. */
async function save(page: Page): Promise<void> {
    await page.getByTestId('save-board').click();
    await expectSaved(page);
}

/** A reload with unsaved edits asks first (beforeunload): accept it. */
function acceptLeaving(page: Page): void {
    page.on('dialog', (dialog) => void dialog.accept());
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

        test('edits apply at once and are saved only with Save or Ctrl+S', async ({ page, lab }) => {
            const { nodes, edges } = template('reel-from-outliers');
            const id = await lab.insertBoard(E2E_USER, { title: 'Reel board', templateId: 'reel-from-outliers', nodes, edges });
            await openBoard(page, id);
            await expectSaved(page);
            await expect(page.getByTestId('save-board')).toBeDisabled();

            await page.locator('#working-query').fill('hostel cooking');
            await page.locator('#note-text').fill('Keep it under 40 seconds');
            await expect(page.getByTestId('save-state')).toHaveText('Unsaved changes');
            // No autosave: nothing reaches the database until Save.
            await page.waitForTimeout(1_500);
            expect((await lab.getBoard(id))?.nodes.find((node) => node.id === 'working')?.data.query).toBe('');

            await page.keyboard.press('ControlOrMeta+s');
            await expectSaved(page);
            expect((await lab.getBoard(id))?.nodes.find((node) => node.id === 'working')?.data.query).toBe('hostel cooking');

            // Switching platforms is instant and only marks the board unsaved.
            const youtube = box(page, 'working').getByRole('button', { name: 'YouTube' });
            await youtube.click();
            await expect(youtube).toHaveAttribute('data-state', 'off');
            await expect(page.getByTestId('save-state')).toHaveText('Unsaved changes');
            await save(page);
            await expect
                .poll(async () => (await lab.getBoard(id))?.nodes.find((node) => node.id === 'working')?.data.platforms)
                .toEqual(['instagram']);

            await page.reload();
            await waitForHydration(page, '[role="toolbar"] button');
            await expect(page.locator('#working-query')).toHaveValue('hostel cooking');
            await expect(page.locator('#note-text')).toHaveValue('Keep it under 40 seconds');
            await expect(page.getByTestId('draft-notice')).toHaveCount(0);
        });

        test('unsaved edits survive a reload as a local draft, and offline is said', async ({ page, context, lab }) => {
            const { nodes, edges } = template('reel-from-outliers');
            const id = await lab.insertBoard(E2E_USER, { title: 'Reel board', templateId: 'reel-from-outliers', nodes, edges });
            await openBoard(page, id);
            acceptLeaving(page);

            // Offline: told so, Save waits, the edits stay.
            await context.setOffline(true);
            await expect(page.getByTestId('offline-notice')).toBeVisible();
            await page.locator('#note-text').fill('Written on a train');
            await expect(page.getByTestId('save-state')).toHaveText('Offline: not saved');
            await expect(page.getByTestId('save-board')).toBeDisabled();
            await context.setOffline(false);
            await expect(page.getByTestId('offline-notice')).toHaveCount(0);
            await expect(page.getByTestId('save-state')).toHaveText('Unsaved changes');

            // Reload without saving: the draft is offered back.
            await page.waitForTimeout(800);
            await page.reload();
            await waitForHydration(page, '[role="toolbar"] button');
            await expect(page.locator('#note-text')).toHaveValue('');
            await expect(page.getByTestId('draft-notice')).toBeVisible();
            await page.getByRole('button', { name: 'Restore my edits' }).click();
            await expect(page.locator('#note-text')).toHaveValue('Written on a train');
            await save(page);
            await expect
                .poll(async () => (await lab.getBoard(id))?.nodes.find((node) => node.id === 'note')?.data.text)
                .toBe('Written on a train');

            // Discarding a draft drops it for good.
            await page.locator('#note-text').fill('Not this one');
            await page.waitForTimeout(800);
            await page.reload();
            await waitForHydration(page, '[role="toolbar"] button');
            await page.getByRole('button', { name: 'Discard them' }).click();
            await expect(page.getByTestId('draft-notice')).toHaveCount(0);
            await page.reload();
            await waitForHydration(page, '[role="toolbar"] button');
            await expect(page.getByTestId('draft-notice')).toHaveCount(0);
            await expect(page.locator('#note-text')).toHaveValue('Written on a train');
        });

        test('a save never wipes drafts a scheduled run wrote meanwhile', async ({ page, lab }) => {
            const { nodes, edges } = template('reel-from-outliers');
            const id = await lab.insertBoard(E2E_USER, { title: 'Reel board', templateId: 'reel-from-outliers', nodes, edges });
            await openBoard(page, id);

            // The tab is open; a scheduled run writes a draft; then the user saves their own edit.
            await lab.writeScheduledDraft(id, 'output', 'HOOK: written by the schedule');
            await page.locator('#note-text').fill('My angle');
            await page.getByTestId('save-board').click();
            await expect(page.getByTestId('save-conflict')).toBeVisible();
            await expect(page.getByTestId('save-state')).toHaveText('Not saved: board changed');
            expect((await lab.getBoard(id))?.nodes.find((node) => node.id === 'note')?.data.text).toBe('');
            await expect(page.locator('#note-text')).toHaveValue('My angle');

            await page.getByRole('button', { name: 'Keep my edits and add the new drafts' }).click();
            await expectSaved(page);
            await expect(page.getByTestId('save-conflict')).toHaveCount(0);
            await expect(page.locator('#output-draft')).toHaveValue('HOOK: written by the schedule');
            const saved = await lab.getBoard(id);
            expect(saved?.nodes.find((node) => node.id === 'note')?.data.text).toBe('My angle');
            expect(saved?.nodes.find((node) => node.id === 'output')?.data.text).toBe('HOOK: written by the schedule');

            // Taking the latest instead drops the local edit.
            await lab.writeScheduledDraft(id, 'output', 'HOOK: second scheduled draft');
            await page.locator('#note-text').fill('Not kept');
            await page.keyboard.press('ControlOrMeta+s');
            await expect(page.getByTestId('save-conflict')).toBeVisible();
            await page.getByRole('button', { name: 'Load the latest board (drop my edits)' }).click();
            await expectSaved(page);
            await expect(page.locator('#note-text')).toHaveValue('My angle');
            await expect(page.locator('#output-draft')).toHaveValue('HOOK: second scheduled draft');
        });

        test('Flow / Canvas is a two-way toggle', async ({ page, lab }) => {
            const { nodes, edges } = template('youtube-script');
            const id = await lab.insertBoard(E2E_USER, { title: 'Toggle board', templateId: 'youtube-script', nodes, edges });
            await openBoard(page, id);
            const toggle = page.getByRole('radiogroup', { name: 'View' });
            await expect(toggle.getByRole('radio', { name: canvas ? 'Canvas' : 'Flow' })).toHaveAttribute('data-state', 'on');

            await toggle.getByRole('radio', { name: 'Flow' }).click();
            await expect(page.getByTestId('flow-card')).toHaveCount(nodes.length);
            await expectNoSidewaysScroll(page);
            await toggle.getByRole('radio', { name: 'Canvas' }).click();
            await expect(page.getByTestId('board-node')).toHaveCount(nodes.length);
            await expectNoSidewaysScroll(page);
        });

        test('each node says what it gets and sends, and the board explains how it runs', async ({ page, lab }) => {
            const { nodes, edges } = template('reel-from-outliers');
            const id = await lab.insertBoard(E2E_USER, { title: 'Reel board', templateId: 'reel-from-outliers', nodes, edges });
            await openBoard(page, id);

            await expect(box(page, 'hooks').getByTestId('node-gets')).toContainText("top posts from What's working");
            await expect(box(page, 'write').getByTestId('node-gets')).toContainText('your tone from Your tone');
            await expect(box(page, 'write').getByTestId('node-gets')).toContainText('your note from Note');
            await expect(box(page, 'working').getByTestId('node-sends')).toContainText('Sends top posts to Hooks');

            // "Your tone" with no accounts says how to connect them.
            await expect(box(page, 'voice').getByTestId('tone-empty')).toBeVisible();
            await expect(box(page, 'voice').getByRole('link', { name: 'Connect accounts' })).toHaveAttribute('href', SETTINGS_URL);

            // Inputs, Hooks, Write, Output, Check, then what you do with the draft.
            const howItRuns = page.getByTestId('how-it-runs');
            await expect(howItRuns.locator('ol > li')).toHaveCount(6);
            await expect(howItRuns).toContainText("What's working finds the top posts for your topic");
            await expect(howItRuns).toContainText('Write puts');

            // A node with nothing plugged in says what to plug in.
            await page.getByRole('button', { name: 'Add node' }).click();
            await page.getByRole('menuitem', { name: /^Check before posting/ }).click();
            const check = page.locator('[data-kind="check"]:not([data-node-id="check"])');
            await expect(check.getByTestId('node-needs')).toContainText('Plug in an Output');
            await expectNoSidewaysScroll(page);
        });

        test('Your tone lists the accounts it reads', async ({ page, lab }) => {
            await lab.setProfile(E2E_USER, { handles: { youtube: 'mykitchenlab', instagram: 'mykitchen.ig' } });
            const { nodes, edges } = template('youtube-script');
            const id = await lab.insertBoard(E2E_USER, { title: 'Script', templateId: 'youtube-script', nodes, edges });
            await openBoard(page, id);
            const accounts = box(page, 'voice').getByTestId('tone-accounts');
            await expect(accounts).toContainText('@mykitchenlab');
            await expect(accounts).toContainText('@mykitchen.ig');
            await expect(page.getByTestId('how-it-runs')).toContainText(
                'Your tone reads your recent posts (@mykitchenlab on YouTube and @mykitchen.ig on Instagram)',
            );
        });

        test('a board can be scheduled, paused and resumed, and shows its scheduled runs', async ({ page, lab }) => {
            const { nodes, edges } = template('reel-from-outliers');
            const id = await lab.insertBoard(E2E_USER, { title: 'Daily reel', templateId: 'reel-from-outliers', nodes, edges });
            await lab.insertBoardRun(E2E_USER, id, {
                status: 'partial',
                summary: 'Wrote 1 draft. 1 of 7 nodes had a problem.',
                nodes: [
                    { nodeId: 'working', status: 'done', summary: '3 standout posts out of 24 looked at', sent: '12 top posts' },
                    { nodeId: 'voice', status: 'error', error: 'No accounts to learn your tone from. Connect yours in Content Lab Settings.' },
                ],
                outputs: [{ nodeId: 'output', format: 'reel', text: 'HOOK: a scheduled draft' }],
            });
            await openBoard(page, id);

            // The last scheduled run's results are on the board, with real counts on the wires.
            await expect(page.getByTestId('shown-run')).toBeVisible();
            await expect(box(page, 'hooks').getByTestId('node-gets')).toContainText("12 top posts from What's working");

            await page.getByTestId('open-schedule').click();
            const sheet = page.getByTestId('schedule-sheet');
            await expect(sheet.getByTestId('schedule-status')).toContainText('Not scheduled');
            await expect(sheet.getByTestId('schedule-run')).toHaveCount(1);
            await expectNoSidewaysScroll(page);

            // Monday to Friday is pre-ticked; add Saturday.
            await sheet.getByRole('radio', { name: 'Some days' }).click();
            await sheet.getByRole('button', { name: 'Saturday' }).click();
            await sheet.getByLabel('At', { exact: true }).fill('07:30');
            await expect(sheet.getByTestId('schedule-preview')).toContainText('Mon, Tue, Wed, Thu, Fri, Sat at 7:30 AM');
            await sheet.getByRole('button', { name: 'Save schedule' }).click();
            await expect(sheet.getByTestId('schedule-status')).toContainText('Mon, Tue, Wed, Thu, Fri, Sat at 7:30 AM');
            await expect(sheet.getByTestId('schedule-next')).toContainText('Next run:');
            await expect
                .poll(async () => {
                    const saved = await lab.getBoard(id);
                    return [saved?.schedule?.repeat, saved?.schedule?.time, saved?.schedule?.days.length, saved?.nextRunAt instanceof Date];
                })
                .toEqual(['weekdays', '07:30', 6, true]);
            expect((await lab.getBoard(id))!.nextRunAt!.getTime()).toBeGreaterThan(Date.now());

            await sheet.getByRole('button', { name: 'Pause', exact: true }).click();
            await expect(sheet.getByTestId('schedule-status')).toContainText('Paused');
            await expect
                .poll(async () => {
                    const saved = await lab.getBoard(id);
                    return [saved?.schedule?.paused, saved?.nextRunAt];
                })
                .toEqual([true, null]);
            await sheet.getByRole('button', { name: 'Resume', exact: true }).click();
            await expect(sheet.getByTestId('schedule-next')).toContainText('Next run:');
            await expect.poll(async () => (await lab.getBoard(id))?.nextRunAt instanceof Date).toBe(true);

            await sheet.getByRole('radio', { name: 'Every few hours' }).click();
            await expect(sheet.getByTestId('schedule-preview')).toContainText('Every 6 hours');
            await sheet.getByRole('button', { name: 'Save schedule' }).click();
            await expect(sheet.getByTestId('schedule-status')).toContainText('Every 6 hours');

            // A run's drafts can be put back on the board from the history.
            const run = sheet.getByTestId('schedule-run');
            await run.getByRole('button').first().click();
            await expect(run).toContainText('HOOK: a scheduled draft');
            await run.getByRole('button', { name: 'Show on the board' }).click();
            await expect(sheet).toBeHidden();
            await expect(page.locator('#output-draft')).toHaveValue('HOOK: a scheduled draft');
            await save(page);

            await page.goto(BOARDS_URL);
            await expect(page.getByTestId('board-schedule')).toHaveText('Scheduled: Every 6 hours');
        });

        test('the scheduled runner refuses callers without the secret', async ({ request }) => {
            const response = await request.post('/api/content-lab/boards/run-due');
            expect([401, 503]).toContain(response.status());
        });

        test('nodes can be added, wired and removed, and saved', async ({ page, lab }) => {
            const { nodes, edges } = template('youtube-script');
            const id = await lab.insertBoard(E2E_USER, { title: 'Script board', templateId: 'youtube-script', nodes, edges });
            await openBoard(page, id);

            if (viewport.name === 'desktop') {
                // A real drag from Your tone's output handle to the Hooks node's input handle.
                const from = box(page, 'voice').locator('.react-flow__handle.source');
                const to = box(page, 'hooks').locator('.react-flow__handle.target');
                const [a, b] = [await from.boundingBox(), await to.boundingBox()];
                await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
                await page.mouse.down();
                await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2, { steps: 12 });
                await page.mouse.up();
                await save(page);
                await expect
                    .poll(async () => (await lab.getBoard(id))?.edges.some((edge) => edge.source === 'voice' && edge.target === 'hooks'))
                    .toBe(true);
            }

            await page.getByRole('button', { name: 'Add node' }).click();
            await page.getByRole('menuitem', { name: /^Note/ }).click();
            const note = page.locator('[data-kind="note"]');
            await expect(note).toHaveCount(1);
            const noteId = (await note.getAttribute('data-node-id'))!;

            await toggleWire(page, 'Note', 'Write');
            if (!canvas) await expect(box(page, noteId).getByTestId('feeds-chip')).toHaveText(['feeds Write']);
            await expect(box(page, noteId).getByTestId('node-sends')).toContainText('Sends your note to Write');
            await save(page);
            await expect
                .poll(async () => (await lab.getBoard(id))?.edges.some((edge) => edge.source === noteId && edge.target === 'write'))
                .toBe(true);
            await expectNoSidewaysScroll(page);

            await page.getByRole('button', { name: 'Delete Note' }).click();
            await expect(note).toHaveCount(0);
            await save(page);
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

            // The wires now say how much travelled along them.
            await expect(box(page, 'hooks').getByTestId('node-gets')).toContainText("3 top posts from What's working");
            await expect(box(page, 'write').getByTestId('node-gets')).toContainText('your tone (2 posts) from Your tone');
            await expect(box(page, 'check').getByTestId('node-gets')).toContainText('draft from Output · Reel');

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

            // The drafts are on the board and saved with it on Save; the results are not saved.
            await expect(page.getByTestId('save-state')).toHaveText('Unsaved changes');
            await save(page);
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
                await save(page);
                await expect.poll(async () => (await lab.getBoard(id))?.edges.some((edge) => edge.target === 'x')).toBe(false);

                await toggleWire(page, 'Write', 'Output · X thread');
                await expect(box(page, 'write').getByTestId('feeds-chip')).toHaveCount(4);
                await save(page);
                await expect.poll(async () => (await lab.getBoard(id))?.edges.some((edge) => edge.target === 'x')).toBe(true);

                await expect(box(page, 'x').getByTestId('node-gets')).toContainText('writing brief from Write');
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
