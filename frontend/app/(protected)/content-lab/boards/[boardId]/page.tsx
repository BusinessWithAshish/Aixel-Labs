import { notFound } from 'next/navigation';
import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { getContentLabBoard, getContentLabProfile, listContentLabBoardRuns } from '@/app/actions/content-lab-actions';
import { isValidObjectId } from '@/helpers/object-id';
import { useBoardPage } from './_hooks/use-board-page';
import { BoardView } from './_components/BoardView';

type BoardPageProps = { params: Promise<{ boardId: string }> };

/** One board: canvas on tablet/desktop, stacked Flow view on phones. */
async function ContentLabBoardPage({ params }: BoardPageProps) {
    const { boardId } = await params;
    if (!isValidObjectId(boardId)) notFound();
    const [boardResponse, profileResponse, runsResponse] = await Promise.all([
        getContentLabBoard(boardId),
        getContentLabProfile(),
        listContentLabBoardRuns(boardId),
    ]);
    if (!boardResponse.data || !profileResponse.data) notFound();

    return (
        <PageLayout title={boardResponse.data.title} className="p-1">
            <PageProvider
                data={{ board: boardResponse.data, profile: profileResponse.data, runs: runsResponse.data ?? [] }}
                usePageHook={useBoardPage}
            >
                <BoardView />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(ContentLabBoardPage);
