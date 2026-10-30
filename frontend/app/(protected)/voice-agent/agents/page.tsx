import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { GeminiKeyNotice } from '@/components/common/voice-agent/GeminiKeyNotice';
import { PageProvider } from '@/contexts/PageStore';
import type { VoiceAgent } from '@aixellabs/backend/db/types';
import { listVoiceAgents } from '@/app/actions/voice-agent-actions';
import { listMyNumbers } from '@/app/actions/voice-number-actions';
import { getGeminiKeyStatus } from '@/app/actions/voice-settings-actions';
import { NO_GEMINI_KEY } from '@/server/voice-agent/gemini-key';
import { canUseWhatsApp } from '@/server/voice-agent/owner-scope';
import { useVoiceAgentsPage, type AgentFilter } from './_hooks/use-voice-agents-page';
import { VoiceAgentsList } from './_components/VoiceAgentsList';

const PAGE_TITLE = 'Agents';
const FILTERS: AgentFilter[] = ['all', 'calls', 'whatsapp', 'none'];

/** Every agent, each with the numbers it works (phone lines and WhatsApp alike). `?show=` opens on one filter. */
async function VoiceAgentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const [response, keyResponse, numbersResponse, whatsapp, params] = await Promise.all([
        listVoiceAgents(),
        getGeminiKeyStatus(),
        listMyNumbers(),
        canUseWhatsApp(),
        searchParams,
    ]);
    const agents: VoiceAgent[] = response.success && response.data ? response.data : [];
    const show = FILTERS.find((f) => f === params.show && (whatsapp || f !== 'whatsapp')) ?? 'all';

    return (
        <PageLayout title={PAGE_TITLE} className="flex flex-col gap-4 p-1">
            <GeminiKeyNotice view={keyResponse.data ?? NO_GEMINI_KEY} action="take or make calls" />
            <PageProvider
                data={{ agents, numbers: numbersResponse.data ?? [], whatsapp, show }}
                usePageHook={useVoiceAgentsPage}
            >
                <VoiceAgentsList />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(VoiceAgentsPage);
