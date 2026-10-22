import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { GeminiKeyNotice } from '@/components/common/voice-agent/GeminiKeyNotice';
import { PageProvider } from '@/contexts/PageStore';
import type { VoiceAgent } from '@aixellabs/backend/db/types';
import { listVoiceAgents } from '@/app/actions/voice-agent-actions';
import { getGeminiKeyStatus } from '@/app/actions/voice-settings-actions';
import { NO_GEMINI_KEY } from '@/server/voice-agent/gemini-key';
import { useVoiceAgentsPage } from './_hooks/use-voice-agents-page';
import { VoiceAgentsList } from './_components/VoiceAgentsList';

const PAGE_TITLE = 'Voice agents';

async function VoiceAgentsPage() {
    const [response, keyResponse] = await Promise.all([listVoiceAgents(), getGeminiKeyStatus()]);
    const agents: VoiceAgent[] = response.success && response.data ? response.data : [];

    return (
        <PageLayout title={PAGE_TITLE} className="flex flex-col gap-4 p-1">
            <GeminiKeyNotice view={keyResponse.data ?? NO_GEMINI_KEY} action="take or make calls" />
            <PageProvider data={{ agents }} usePageHook={useVoiceAgentsPage}>
                <VoiceAgentsList />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(VoiceAgentsPage);
