import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { listMyCalls } from '@/app/actions/voice-call-actions';
import { getVoiceAgentOptions } from '@/app/actions/voice-agent-actions';
import { useCallLogsPage } from './_hooks/use-call-logs-page';
import { CallLogsContent } from './_components/CallLogsContent';
import { parseCallLogFilters } from './_utils/call-log-filters';

const PAGE_TITLE = 'Call logs';
const CALLS_SHOWN = 100;

async function CallLogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const filters = parseCallLogFilters(await searchParams);

    const [callsRes, agentsRes] = await Promise.all([
        listMyCalls({
            agentId: filters.agent,
            includeDeleted: filters.deleted,
            kind: filters.kind,
            success: filters.success,
            range: filters.range,
            search: filters.q,
            limit: CALLS_SHOWN,
        }),
        getVoiceAgentOptions(),
    ]);

    return (
        <PageLayout title={PAGE_TITLE} className="flex flex-col gap-4 p-1">
            <PageProvider
                data={{
                    calls: callsRes.success && callsRes.data ? callsRes.data : [],
                    agents: agentsRes.success && agentsRes.data ? agentsRes.data : [],
                    filters,
                    limit: CALLS_SHOWN,
                    loadError: callsRes.success ? null : (callsRes.error ?? 'Could not load your calls'),
                }}
                usePageHook={useCallLogsPage}
            >
                <CallLogsContent />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(CallLogsPage);
