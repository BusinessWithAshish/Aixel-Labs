import { notFound } from 'next/navigation';
import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { getVoiceAgent, getVoiceAgentUsage, type VoiceAgentUsage } from '@/app/actions/voice-agent-actions';
import { listVoiceConnectedApps, type VoiceConnectedApps } from '@/app/actions/voice-calendar-actions';
import { listVoiceCallerMemories, type VoiceCallerMemoryList } from '@/app/actions/voice-caller-memory-actions';
import { getGeminiKeyStatus } from '@/app/actions/voice-settings-actions';
import { isValidObjectId } from '@/helpers/object-id';
import { NO_GEMINI_KEY } from '@/server/voice-agent/gemini-key';
import { useVoiceAgentEditorPage } from './_hooks/use-voice-agent-editor-page';
import { VoiceAgentWorkspace } from './_components/VoiceAgentWorkspace';

const NO_USAGE: VoiceAgentUsage = { inbound: [], outbound: [] };
const NO_APPS: VoiceConnectedApps = { configured: false, connections: [] };
const NO_MEMORIES: VoiceCallerMemoryList = { memories: [], total: 0 };

async function VoiceAgentPage({
    params,
    searchParams,
}: {
    params: Promise<{ agentId: string }>;
    searchParams: Promise<{ connected?: string | string[] }>;
}) {
    const [{ agentId }, { connected }] = await Promise.all([params, searchParams]);
    const [response, usageResponse, appsResponse, keyResponse, memoriesResponse] = await Promise.all([
        getVoiceAgent(agentId),
        getVoiceAgentUsage(agentId),
        listVoiceConnectedApps(),
        getGeminiKeyStatus(),
        listVoiceCallerMemories(agentId),
    ]);
    if (!response.success || !response.data) {
        return notFound();
    }
    const usage = usageResponse.success && usageResponse.data ? usageResponse.data : NO_USAGE;
    const connectedApps = appsResponse.success && appsResponse.data ? appsResponse.data : NO_APPS;
    const justConnected = typeof connected === 'string' && isValidObjectId(connected) ? connected : null;
    const memories = memoriesResponse.success && memoriesResponse.data ? memoriesResponse.data : NO_MEMORIES;

    return (
        <PageLayout title={response.data.name}>
            <PageProvider
                data={{ agent: response.data, usage, connectedApps, justConnected, memories }}
                usePageHook={useVoiceAgentEditorPage}
            >
                <VoiceAgentWorkspace geminiKey={keyResponse.data ?? NO_GEMINI_KEY} />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(VoiceAgentPage);
