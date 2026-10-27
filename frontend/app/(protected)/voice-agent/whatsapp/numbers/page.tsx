import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { listMyNumbers } from '@/app/actions/voice-number-actions';
import { getVoiceAgentOptions } from '@/app/actions/voice-agent-actions';
import { getGeminiKeyStatus } from '@/app/actions/voice-settings-actions';
import { NO_GEMINI_KEY } from '@/server/voice-agent/gemini-key';
import { usePhoneNumbersPage } from '../../phone-numbers/_hooks/use-phone-numbers-page';
import { PhoneNumbersContent } from '../../phone-numbers/_components/PhoneNumbersContent';
import { WhatsAppTabs } from '../_components/WhatsAppTabs';

/** The WhatsApp section's numbers (the Phone numbers page lists phone lines; a number on both shows in each). */
async function WhatsAppNumbersPage() {
    const [numbersRes, agentsRes, keyRes] = await Promise.all([listMyNumbers(), getVoiceAgentOptions(), getGeminiKeyStatus()]);

    return (
        <PageLayout title="WhatsApp" className="flex flex-col gap-4 p-1">
            <WhatsAppTabs />
            <PageProvider
                data={{
                    numbers: numbersRes.success && numbersRes.data ? numbersRes.data : [],
                    agents: agentsRes.success && agentsRes.data ? agentsRes.data : [],
                    loadError: numbersRes.success ? null : (numbersRes.error ?? 'Could not load your numbers'),
                    geminiKey: keyRes.data ?? NO_GEMINI_KEY,
                    scope: 'whatsapp',
                }}
                usePageHook={usePhoneNumbersPage}
            >
                <PhoneNumbersContent />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(WhatsAppNumbersPage);
