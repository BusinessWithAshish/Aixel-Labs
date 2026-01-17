'use client';

import { Button } from '../ui/button';
import { useRouter } from 'next/navigation';

export function NoDataFound() {
    const router = useRouter();

    return (
        <div className="flex h-full w-full flex-col gap-2 items-center justify-center">
            <p className="text-muted-foreground">No data found.</p>
            <Button onClick={() => router.back()}>
                Go back
            </Button>
        </div>
    );
}
