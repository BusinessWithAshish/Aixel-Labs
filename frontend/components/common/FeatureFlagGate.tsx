import type { ReactNode } from 'react';
import { ComingSoon } from '@/components/common/ComingSoon';
import { evaluateFlag, type FeatureFlagKey } from '@/flags';

type FeatureFlagGateProps = {
    flagKey: FeatureFlagKey;
    children: ReactNode;
};

export async function FeatureFlagGate({ flagKey, children }: FeatureFlagGateProps) {
    const enabled = await evaluateFlag(flagKey);

    if (!enabled) {
        return <ComingSoon />;
    }

    return children;
}
