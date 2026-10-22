import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { PageProvider } from '@/contexts/PageStore';
import { getGeminiKeyStatus } from '@/app/actions/voice-settings-actions';
import { NO_GEMINI_KEY } from '@/server/voice-agent/gemini-key';
import { useVoiceSettingsPage } from './_hooks/use-voice-settings-page';
import { AiModelSection } from './_components/AiModelSection';
import { GeminiKeySection } from './_components/GeminiKeySection';

const PAGE_TITLE = 'Voice settings';

/** Settings shared by all of the owner's agents. A new area (voices, speech providers) is one more section. */
async function VoiceSettingsPage() {
    const keyResponse = await getGeminiKeyStatus();

    return (
        <PageLayout title={PAGE_TITLE} className="p-1">
            <PageProvider data={{ geminiKey: keyResponse.data ?? NO_GEMINI_KEY }} usePageHook={useVoiceSettingsPage}>
                <Card className="h-auto max-w-3xl">
                    <CardContent className="grid gap-5">
                        <AiModelSection />
                        <Separator />
                        <GeminiKeySection />
                    </CardContent>
                </Card>
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(VoiceSettingsPage);
