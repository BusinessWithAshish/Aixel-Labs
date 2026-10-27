import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { GeminiKeyNotice } from '@/components/common/voice-agent/GeminiKeyNotice';
import { PageProvider } from '@/contexts/PageStore';
import { listVoiceAgents } from '@/app/actions/voice-agent-actions';
import { getGeminiKeyStatus } from '@/app/actions/voice-settings-actions';
import { NO_GEMINI_KEY } from '@/server/voice-agent/gemini-key';
import { useVoiceAgentsPage } from '../../agents/_hooks/use-voice-agents-page';
import { VoiceAgentsList } from '../../agents/_components/VoiceAgentsList';
import { WhatsAppTabs } from '../_components/WhatsAppTabs';

/** The WhatsApp section's agents: WhatsApp and Phone + WhatsApp ones (the Voice agents page lists the phone ones). */
async function WhatsAppAgentsPage() {
    const [response, keyResponse] = await Promise.all([listVoiceAgents(), getGeminiKeyStatus()]);

    return (
        <PageLayout title="WhatsApp" className="flex flex-col gap-4 p-1">
            <WhatsAppTabs />
            <GeminiKeyNotice view={keyResponse.data ?? NO_GEMINI_KEY} action="answer chats and calls" />
            <PageProvider data={{ agents: response.data ?? [], scope: 'whatsapp' }} usePageHook={useVoiceAgentsPage}>
                <VoiceAgentsList />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(WhatsAppAgentsPage);
