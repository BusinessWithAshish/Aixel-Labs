import { notFound } from 'next/navigation';
import { CONTENT_LAB_CONNECT_PLATFORMS, type ContentLabConnectPlatform } from '@aixellabs/backend/db/types';
import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { getContentLabProfile } from '@/app/actions/content-lab-actions';
import { getContentLabAiKey, listContentLabConnections } from '@/app/actions/content-lab-settings-actions';
import { useContentLabSettingsPage, type ContentLabSettingsPageData } from './_hooks/use-content-lab-settings-page';
import { ContentLabSettings } from './_components/ContentLabSettings';

type SettingsParams = Record<'connect' | 'connected_account_id' | 'status', string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : null);

/**
 * Own accounts (connected through Composio, or a public handle), Content Lab's own AI key, and the
 * default country and language. Composio's Connect Link sends the browser back here with
 * `?connect=<platform>&status=success|failed&connected_account_id=ca_...`; the page confirms it from the browser.
 */
async function ContentLabSettingsPage({ searchParams }: { searchParams: Promise<SettingsParams> }) {
    const [params, profile, aiKey, connections] = await Promise.all([
        searchParams,
        getContentLabProfile(),
        getContentLabAiKey(),
        listContentLabConnections(),
    ]);
    if (!profile.data) notFound();
    const connect = one(params.connect);

    const data: ContentLabSettingsPageData = {
        profile: profile.data,
        aiKey: aiKey.data ?? null,
        connections: connections.data ?? { configured: false, connections: [] },
        returning: connect
            ? {
                  platform: CONTENT_LAB_CONNECT_PLATFORMS.includes(connect as ContentLabConnectPlatform)
                      ? (connect as ContentLabConnectPlatform)
                      : null,
                  connectedAccountId: one(params.connected_account_id),
                  composioStatus: one(params.status),
              }
            : null,
    };

    return (
        <PageLayout title="Content Lab settings">
            <PageProvider data={data} usePageHook={useContentLabSettingsPage}>
                <ContentLabSettings />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(ContentLabSettingsPage);
