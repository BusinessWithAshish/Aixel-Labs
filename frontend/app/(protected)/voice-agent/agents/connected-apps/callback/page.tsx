import PageLayout from '@/components/common/PageLayout';
import { PageProvider } from '@/contexts/PageStore';
import { isValidObjectId } from '@/helpers/object-id';
import { VOICE_CALENDAR_PROVIDERS } from '@/helpers/voice-calendar-providers';
import { ConnectedAppCallback } from './_components/ConnectedAppCallback';
import { useConnectedAppCallbackPage, type ConnectedAppCallbackData } from './_hooks/use-connected-app-callback-page';

type CallbackParams = Record<'status' | 'connected_account_id' | 'agent' | 'app', string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : null);

/**
 * Where Composio's Connect Link sends the owner back (`?status=success|failed&connected_account_id=ca_...`,
 * plus our own `agent` and `app`). It renders at once and confirms from the browser (see the hook):
 * confirming here, behind a Suspense boundary, made the redirect land after the page had streamed,
 * so the page's error boundary caught it and showed "No data found." until Next's meta refresh.
 */
export default async function ConnectedAppCallbackPage({ searchParams }: { searchParams: Promise<CallbackParams> }) {
    const params = await searchParams;
    const agent = one(params.agent);
    const data: ConnectedAppCallbackData = {
        connectedAccountId: one(params.connected_account_id),
        composioStatus: one(params.status),
        agentId: agent && isValidObjectId(agent) ? agent : null,
        provider: VOICE_CALENDAR_PROVIDERS.find((p) => p.provider === one(params.app))?.provider ?? null,
    };

    return (
        <PageLayout title="Connected apps">
            <PageProvider data={data} usePageHook={useConnectedAppCallbackPage}>
                <ConnectedAppCallback />
            </PageProvider>
        </PageLayout>
    );
}
