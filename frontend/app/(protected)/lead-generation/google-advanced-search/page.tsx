import PageLayout from '@/components/common/PageLayout';
import { PageProvider } from '@/contexts/PageStore';
import { useGoogleAdvancedSearchForm } from './_hooks/use-google-advanced-search-form';
import { GoogleAdvancedSearchFormWrapper } from './_components/GoogleAdvancedSearchFormWrapper';

export default function GoogleAdvancedSearchPage() {
    return (
        <PageProvider usePageHook={useGoogleAdvancedSearchForm}>
            <PageLayout className="space-y-4" title="Google Advanced Search">
                <GoogleAdvancedSearchFormWrapper />
            </PageLayout>
        </PageProvider>
    );
}
