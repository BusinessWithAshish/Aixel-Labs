import { E2eDb } from './support/db';
import {
    ADMIN_STORAGE_STATE,
    E2E_TENANT,
    E2E_WORKERS,
    USER_STORAGE_STATE,
    e2eBaseUrl,
    e2eDbName,
} from './support/env';
import { clearEmulatorUsers, saveSignedInState } from './support/session';
import { E2E_ADMIN, E2E_USER } from './support/users';

/**
 * The app must be serving the database this run just seeded. A server left over from
 * another setup (or one that picked up `.env`) would otherwise run tests against real data.
 */
async function assertAppUsesE2eDatabase(baseUrl: string, tenantLabel: string): Promise<void> {
    const res = await fetch(`${baseUrl}/api/tenant?name=${E2E_TENANT}`);
    const body = (await res.json().catch(() => null)) as { data?: { label?: string } } | null;
    if (body?.data?.label !== tenantLabel) {
        throw new Error(
            `The app at ${baseUrl} is not reading the E2E database (expected tenant label "${tenantLabel}", ` +
                `got ${JSON.stringify(body)}). Stop whatever is running on that port and rerun.`,
        );
    }
}

/** Seeds one database per worker; the same signed-in users work on every worker's server. */
export default async function globalSetup(): Promise<void> {
    const workers = Array.from({ length: E2E_WORKERS }, (_, worker) => worker);
    const tenantLabel = `E2E ${Date.now()}`;

    await Promise.all(
        workers.map(async (worker) => {
            const db = await E2eDb.connect(e2eDbName(worker));
            try {
                await db.seed(tenantLabel);
            } finally {
                await db.close();
            }
        }),
    );

    await clearEmulatorUsers();
    await saveSignedInState(E2E_USER, USER_STORAGE_STATE);
    await saveSignedInState(E2E_ADMIN, ADMIN_STORAGE_STATE);

    await Promise.all(workers.map((worker) => assertAppUsesE2eDatabase(e2eBaseUrl(worker), tenantLabel)));
}
