import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { PageProvider } from '@/contexts/PageStore';
import { listContentLabBoards } from '@/app/actions/content-lab-actions';
import { useBoardsPage } from './_hooks/use-boards-page';
import { BoardsList } from './_components/BoardsList';

/** The user's boards, and the templates a new one starts from. */
async function ContentLabBoardsPage() {
    const response = await listContentLabBoards();

    return (
        <PageLayout title="Boards">
            <PageProvider data={{ boards: response.data ?? [] }} usePageHook={useBoardsPage}>
                <BoardsList />
            </PageProvider>
        </PageLayout>
    );
}

export default withPageHandler(ContentLabBoardsPage);
