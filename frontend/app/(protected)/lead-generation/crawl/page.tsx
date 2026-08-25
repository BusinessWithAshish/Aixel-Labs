import PageLayout from '@/components/common/PageLayout';
import { PageProvider } from '@/contexts/PageStore';
import { useCrawlForm } from './_hooks/use-crawl-form';
import { CrawlFormWrapper } from './_components/CrawlFormWrapper';

export default function CrawlPage() {
    return (
        <PageProvider usePageHook={useCrawlForm}>
            <PageLayout className="space-y-4" title="Crawl">
                <CrawlFormWrapper />
            </PageLayout>
        </PageProvider>
    );
}
