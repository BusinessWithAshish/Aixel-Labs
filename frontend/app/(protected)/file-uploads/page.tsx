import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { withAdminOnly } from '@/components/hocs/with-admin';
import { PageProvider } from '@/contexts/PageStore';
import { FileDropZone } from '@/components/common/upload/FileDropZone';
import { useFileUploadsPage } from './_hooks/use-file-uploads-page';

const PAGE_TITLE = 'File Uploads';

async function FileUploadsPage() {
    return (
        <PageProvider usePageHook={useFileUploadsPage}>
            <PageLayout title={PAGE_TITLE}>
                <FileDropZone />
            </PageLayout>
        </PageProvider>
    );
}

export default withAdminOnly(withPageHandler(FileUploadsPage));
