import { notFound } from 'next/navigation';
import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { getVoiceAgent, getVoiceAgentUsage, type VoiceAgentUsage } from '@/app/actions/voice-agent-actions';
import { listVoiceConnectedApps, type VoiceConnectedApps } from '@/app/actions/voice-calendar-actions';
import { listVoiceCallerMemories, type VoiceCallerMemoryList } from '@/app/actions/voice-caller-memory-actions';
import { getAgentStackOptions, getGeminiKeyStatus, type VoiceAgentStackOptions } from '@/app/actions/voice-settings-actions';
import { getAgentCostTotals } from '@/app/actions/voice-call-actions';
import { listMyNumbers } from '@/app/actions/voice-number-actions';
import { isValidObjectId } from '@/helpers/object-id';
import { NO_GEMINI_KEY } from '@/server/voice-agent/gemini-key';
import { BUILT_IN_VOICES } from '@/helpers/voice-catalogue';
import { FALLBACK_CATALOGUE } from '@/helpers/voice-stack';
import { useVoiceAgentEditorPage } from './_hooks/use-voice-agent-editor-page';
import { VoiceAgentEditor } from './_components/VoiceAgentEditor';
import { VoiceAgentCostEstimate } from './_components/VoiceAgentCostEstimate';
import { VoicePlayground } from './_components/VoicePlayground';

const NO_USAGE: VoiceAgentUsage = { inbound: [], outbound: [] };
const NO_APPS: VoiceConnectedApps = { configured: false, connections: [] };
const NO_MEMORIES: VoiceCallerMemoryList = { memories: [], total: 0 };
const NO_STACK_OPTIONS: VoiceAgentStackOptions = { keys: [], catalogue: FALLBACK_CATALOGUE, voices: BUILT_IN_VOICES };

async function VoiceAgentPage({
    params,
    searchParams,
}: {
    params: Promise<{ agentId: string }>;
    searchParams: Promise<{ connected?: string | string[] }>;
}) {
    const [{ agentId }, { connected }] = await Promise.all([params, searchParams]);
    const [
        response,
        usageResponse,
        numbersResponse,
        appsResponse,
        keyResponse,
        memoriesResponse,
        costsResponse,
        stackOptionsResponse,
    ] = await Promise.all([
        getVoiceAgent(agentId),
        getVoiceAgentUsage(agentId),
        listMyNumbers(),
        listVoiceConnectedApps(),
        getGeminiKeyStatus(agentId),
        listVoiceCallerMemories(agentId),
        getAgentCostTotals(agentId),
        getAgentStackOptions(),
    ]);
    if (!response.success || !response.data) {
        return notFound();
    }
    const usage = usageResponse.success && usageResponse.data ? usageResponse.data : NO_USAGE;
    const connectedApps = appsResponse.success && appsResponse.data ? appsResponse.data : NO_APPS;
    const justConnected = typeof connected === 'string' && isValidObjectId(connected) ? connected : null;
    const memories = memoriesResponse.success && memoriesResponse.data ? memoriesResponse.data : NO_MEMORIES;

    // Editor beside its cost and the playground on wide screens, stacked on narrow ones.
    return (
        <PageLayout
            title={response.data.name}
            className="grid items-start gap-4 p-1 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]"
        >
            <PageProvider
                data={{
                    agent: response.data,
                    usage,
                    // Empty when the owner was not granted Phone numbers: the dropdown then offers to connect one.
                    ownedNumbers: numbersResponse.data ?? [],
                    connectedApps,
                    justConnected,
                    memories,
                    geminiKey: keyResponse.data ?? NO_GEMINI_KEY,
                    costTotals: costsResponse.data?.[0] ?? null,
                    stackOptions: stackOptionsResponse.data ?? NO_STACK_OPTIONS,
                }}
                usePageHook={useVoiceAgentEditorPage}
            >
                <VoiceAgentEditor />
                <div className="grid min-w-0 gap-4 lg:sticky lg:top-0">
                    <VoiceAgentCostEstimate />
                    <VoicePlayground />
                </div>
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(VoiceAgentPage);
