'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function LegalBackButton() {
    const router = useRouter();

    return (
        <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft />
            Back
        </Button>
    );
}
