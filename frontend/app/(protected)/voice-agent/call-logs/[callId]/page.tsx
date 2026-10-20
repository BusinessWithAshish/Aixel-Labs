import { notFound } from 'next/navigation';
import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { getCall } from '@/app/actions/voice-call-actions';
import { getCallerMemoryForCall } from '@/app/actions/voice-caller-memory-actions';
import { isValidObjectId } from '@/helpers/object-id';
import { useCallDetailPage } from './_hooks/use-call-detail-page';
import { CallDetail } from './_components/CallDetail';

async function CallDetailPage({ params }: { params: Promise<{ callId: string }> }) {
    const { callId } = await params;
    if (!isValidObjectId(callId)) notFound();

    const [res, memoryRes] = await Promise.all([getCall(callId), getCallerMemoryForCall(callId)]);
    if (!res.success || !res.data) notFound();
    const call = res.data;
    const memory = memoryRes.success ? (memoryRes.data ?? null) : null;

    return (
        <PageLayout title={`Call with ${call.agentName ?? 'a deleted agent'}`}>
            <PageProvider data={{ call, memory }} usePageHook={useCallDetailPage}>
                <CallDetail />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(CallDetailPage);
