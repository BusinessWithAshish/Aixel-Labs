import { E2eDb } from './support/db';
import { ADMIN_STORAGE_STATE, E2E_BASE_URL, E2E_TENANT, USER_STORAGE_STATE } from './support/env';
import { clearEmulatorUsers, saveSignedInState } from './support/session';
import { E2E_ADMIN, E2E_USER } from './support/users';

/**
 * The app must be serving the database this run just seeded. A server left over from
 * another setup (or one that picked up `.env`) would otherwise run tests against real data.
 */
async function assertAppUsesE2eDatabase(tenantLabel: string): Promise<void> {
    const res = await fetch(`${E2E_BASE_URL}/api/tenant?name=${E2E_TENANT}`);
    const body = (await res.json().catch(() => null)) as { data?: { label?: string } } | null;
    if (body?.data?.label !== tenantLabel) {
        throw new Error(
            `The app at ${E2E_BASE_URL} is not reading the E2E database (expected tenant label "${tenantLabel}", ` +
                `got ${JSON.stringify(body)}). Stop whatever is running on that port and rerun.`,
        );
    }
}

export default async function globalSetup(): Promise<void> {
    const tenantLabel = `E2E ${Date.now()}`;

    const db = await E2eDb.connect();
    try {
        await db.seed(tenantLabel);
    } finally {
        await db.close();
    }

    await clearEmulatorUsers();
    await saveSignedInState(E2E_USER, USER_STORAGE_STATE);
    await saveSignedInState(E2E_ADMIN, ADMIN_STORAGE_STATE);

    await assertAppUsesE2eDatabase(tenantLabel);
}
