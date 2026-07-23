import PageLayout from '@/components/common/PageLayout';
import { GoogleMapsAdvancedFormWrapper } from './_components/GoogleMapsAdvancedFormWrapper';

export default function GoogleMapsAdvancedLeadGenerationPage() {
    return (
        <PageLayout className="space-y-4" title="Google Maps Advanced">
            <GoogleMapsAdvancedFormWrapper />
        </PageLayout>
    );
}
