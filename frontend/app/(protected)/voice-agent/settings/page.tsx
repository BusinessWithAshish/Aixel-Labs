import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { getVoiceKeys } from '@/app/actions/voice-settings-actions';
import { useVoiceSettingsPage } from './_hooks/use-voice-settings-page';
import { ProviderKeysCard } from './_components/ProviderKeysCard';

const PAGE_TITLE = 'Voice settings';

/** The owner's API keys, shared by all their agents (each agent picks its models and keys in its Agent stack). */
async function VoiceSettingsPage() {
    const response = await getVoiceKeys();

    return (
        <PageLayout title={PAGE_TITLE} className="flex max-w-3xl flex-col gap-4 p-1">
            <PageProvider data={{ keys: response.data ?? [] }} usePageHook={useVoiceSettingsPage}>
                <ProviderKeysCard />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(VoiceSettingsPage);
