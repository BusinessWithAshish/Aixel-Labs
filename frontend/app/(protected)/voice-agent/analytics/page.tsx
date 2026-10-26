import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import PageLayout from '@/components/common/PageLayout';
import { subModuleLabelMap } from '@/config/sidebar.config';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { getVoiceAnalytics } from '@/app/actions/voice-analytics-actions';
import { getVoiceAgentOptions } from '@/app/actions/voice-agent-actions';
import { isValidObjectId } from '@/helpers/object-id';
import { DEFAULT_ANALYTICS_RANGE, parseCallRange } from '@/helpers/voice-call-ranges';
import { useVoiceAnalyticsPage } from './_hooks/use-voice-analytics-page';
import { VoiceAnalyticsContent } from './_components/VoiceAnalyticsContent';

const PAGE_TITLE = subModuleLabelMap[VOICE_AGENT_SUB_MODULES.CUSTOM_AGENT_ANALYTICS];

async function VoiceAnalyticsPage({
    searchParams,
}: {
    searchParams: Promise<{ agent?: string | string[]; range?: string | string[]; deleted?: string | string[] }>;
}) {
    const { agent, range: rangeParam, deleted } = await searchParams;
    const agentFilter = typeof agent === 'string' && isValidObjectId(agent) ? agent : null;
    const includeDeleted = deleted === '1';
    const range = parseCallRange(rangeParam) ?? DEFAULT_ANALYTICS_RANGE;

    const [analyticsRes, agentsRes] = await Promise.all([
        getVoiceAnalytics({ agentId: agentFilter, range, includeDeleted }),
        getVoiceAgentOptions(),
    ]);

    return (
        <PageLayout title={PAGE_TITLE} className="flex flex-col gap-4 p-1">
            <PageProvider
                data={{
                    analytics: analyticsRes.success && analyticsRes.data ? analyticsRes.data : null,
                    agents: agentsRes.success && agentsRes.data ? agentsRes.data : [],
                    agentFilter,
                    includeDeleted,
                    range,
                    loadError: analyticsRes.success ? null : (analyticsRes.error ?? 'Could not load your analytics'),
                }}
                usePageHook={useVoiceAnalyticsPage}
            >
                <VoiceAnalyticsContent />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(VoiceAnalyticsPage);
