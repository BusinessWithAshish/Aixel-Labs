import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { LeadGenDashboard } from '@/app/(protected)/_components/LeadGenDashboard';
import { getLeadGenerationDashboardStats } from '@/app/actions/lead-dashboard-actions';
import {
    DASHBOARD_LEAD_SOURCES,
    type LeadGenerationDashboardStats,
} from '@/app/(protected)/_constants';

const EMPTY_STATS: LeadGenerationDashboardStats = {
    totalLeads: 0,
    totalLists: 0,
    leadsThisWeek: 0,
    averageLeadsPerList: 0,
    bySource: DASHBOARD_LEAD_SOURCES.map((source) => ({ source, count: 0 })),
    trend: [],
    recentLists: [],
    credits: null,
    creditsExempt: true,
};

async function HomePage() {
    const result = await getLeadGenerationDashboardStats();
    const stats = result.success && result.data ? result.data : EMPTY_STATS;

    return (
        <PageLayout title="Home">
            <div className="flex flex-col gap-4 sm:gap-6">
                <LeadGenDashboard stats={stats} />
            </div>
        </PageLayout>
    );
}

export default withPageHandler(HomePage);
