import PageLayout from '@/components/common/PageLayout';
import { useInstagramForm } from './_hooks/use-instagram-form';
import { PageProvider } from '@/contexts/PageStore';
import { InstagramSearchFormWrapper } from './_components/InstagramSearchFormWrapper';

export default function InstagramSearchPage() {
    return (
        <PageProvider usePageHook={useInstagramForm}>
            <PageLayout title="Instagram Search">
                <InstagramSearchFormWrapper />
            </PageLayout>
        </PageProvider>

    );
}


