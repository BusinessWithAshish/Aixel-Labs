import PageLayout from '@/components/common/PageLayout';
import { PageProvider } from '@/contexts/PageStore';
import { useFacebookForm } from './_hooks/use-facebook-form';
import { FacebookFormWrapper } from './_components/FacebookFormWrapper';

export default function FacebookLeadGenerationPage() {
    return (
        <PageProvider usePageHook={useFacebookForm}>
            <PageLayout className="space-y-4" title="Facebook">
                <FacebookFormWrapper />
            </PageLayout>
        </PageProvider>
    );
}

