import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { listMyNumbers } from '@/app/actions/voice-number-actions';
import { getVoiceAgentOptions } from '@/app/actions/voice-agent-actions';
import { getGeminiKeyStatus } from '@/app/actions/voice-settings-actions';
import { NO_GEMINI_KEY } from '@/server/voice-agent/gemini-key';
import { usePhoneNumbersPage } from './_hooks/use-phone-numbers-page';
import { PhoneNumbersContent } from './_components/PhoneNumbersContent';

const PAGE_TITLE = 'Phone numbers';

async function PhoneNumbersPage() {
    const [numbersRes, agentsRes, keyRes] = await Promise.all([
        listMyNumbers(),
        getVoiceAgentOptions(),
        getGeminiKeyStatus(),
    ]);

    return (
        <PageLayout title={PAGE_TITLE} className="flex flex-col gap-4 p-1">
            <PageProvider
                data={{
                    numbers: numbersRes.success && numbersRes.data ? numbersRes.data : [],
                    agents: agentsRes.success && agentsRes.data ? agentsRes.data : [],
                    loadError: numbersRes.success ? null : (numbersRes.error ?? 'Could not load your numbers'),
                    geminiKey: keyRes.data ?? NO_GEMINI_KEY,
                }}
                usePageHook={usePhoneNumbersPage}
            >
                <PhoneNumbersContent />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(PhoneNumbersPage);
