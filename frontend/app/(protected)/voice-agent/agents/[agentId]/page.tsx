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
import { VoiceAgentEditor } from './_components/VoiceAgentEditor';
import { VoiceAgentUsedOn } from './_components/VoiceAgentUsedOn';
import { VoicePlayground } from './_components/VoicePlayground';

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

    // Editor beside the numbers it is on and the playground on wide screens, stacked on narrow ones.
    return (
        <PageLayout
            title={response.data.name}
            className="grid items-start gap-4 p-1 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]"
        >
            <PageProvider
                data={{
                    agent: response.data,
                    usage,
                    connectedApps,
                    justConnected,
                    memories,
                    geminiKey: keyResponse.data ?? NO_GEMINI_KEY,
                }}
                usePageHook={useVoiceAgentEditorPage}
            >
                <VoiceAgentEditor />
                <div className="grid min-w-0 gap-4 lg:sticky lg:top-0">
                    <VoiceAgentUsedOn />
                    <VoicePlayground />
                </div>
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(VoiceAgentPage);
