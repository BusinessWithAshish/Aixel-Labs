'use client';

import { Card } from '@/components/ui/card';
import { LeadListDialogs } from './LeadListDialogs';
import { LeadListsBody } from './LeadListsBody';
import { LeadListsToolbar } from './LeadListsToolbar';

export function UserLeadLists() {
    return (
        <Card className="gap-2">
            <LeadListsToolbar />
            <LeadListsBody />
            <LeadListDialogs />
        </Card>
    );
}
