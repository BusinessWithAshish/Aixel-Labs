import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { getVoiceStackSettings } from '@/app/actions/voice-settings-actions';
import { useVoiceSettingsPage } from './_hooks/use-voice-settings-page';
import { ProviderKeysCard } from './_components/ProviderKeysCard';
import { VoiceStackCard } from './_components/VoiceStackCard';

const PAGE_TITLE = 'Voice settings';

/** Settings shared by all of the owner's agents: the stack they run on and the API keys behind it. */
async function VoiceSettingsPage() {
    const response = await getVoiceStackSettings();

    return (
        <PageLayout title={PAGE_TITLE} className="flex max-w-3xl flex-col gap-4 p-1">
            <PageProvider data={response.data ?? { keys: [], stack: null }} usePageHook={useVoiceSettingsPage}>
                <VoiceStackCard />
                <ProviderKeysCard />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(VoiceSettingsPage);
