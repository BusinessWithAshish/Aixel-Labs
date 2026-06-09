import { FeatureFlagGate } from '@/components/common/FeatureFlagGate';
import { FeatureFlagKey } from '@/flags';
import { LinkedInByPeopleFormSection } from './LinkedInByPeopleFormSection';
import { LinkedInFormWrapperClient } from './LinkedInFormWrapperClient';

export function LinkedInFormWrapper() {
    return (
        <LinkedInFormWrapperClient>
            <FeatureFlagGate flagKey={FeatureFlagKey.LINKEDIN_BY_PEOPLE}>
                <LinkedInByPeopleFormSection />
            </FeatureFlagGate>
        </LinkedInFormWrapperClient>
    );
}
