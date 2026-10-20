import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { listMyCalls, type CallSuccessFilter } from '@/app/actions/voice-call-actions';
import { getVoiceAgentOptions } from '@/app/actions/voice-agent-actions';
import { isValidObjectId } from '@/helpers/object-id';
import { useCallLogsPage } from './_hooks/use-call-logs-page';
import { CallLogsContent } from './_components/CallLogsContent';

const PAGE_TITLE = 'Call logs';
const CALLS_SHOWN = 100;

async function CallLogsPage({
    searchParams,
}: {
    searchParams: Promise<{ agent?: string | string[]; success?: string | string[] }>;
}) {
    const { agent, success } = await searchParams;
    const agentFilter = typeof agent === 'string' && isValidObjectId(agent) ? agent : null;
    const successFilter: CallSuccessFilter | null = success === 'yes' || success === 'no' ? success : null;

    const [callsRes, agentsRes] = await Promise.all([
        listMyCalls({ agentId: agentFilter, success: successFilter, limit: CALLS_SHOWN }),
        getVoiceAgentOptions(),
    ]);

    return (
        <PageLayout title={PAGE_TITLE}>
            <PageProvider
                data={{
                    calls: callsRes.success && callsRes.data ? callsRes.data : [],
                    agents: agentsRes.success && agentsRes.data ? agentsRes.data : [],
                    agentFilter,
                    successFilter,
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
