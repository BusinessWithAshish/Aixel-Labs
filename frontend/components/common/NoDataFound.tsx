'use client';

import { Button } from '../ui/button';
import { useRouter } from 'next/navigation';

type NoDataFoundProps = {
    showBackButton?: boolean;
    message?: string;
    customBackAction?: () => void;
}

export function NoDataFound(props: NoDataFoundProps) {

    const { showBackButton = true, message = 'No data found.', customBackAction } = props;
    const router = useRouter();

    return (
        <div className="flex h-full w-full flex-col gap-2 items-center justify-center">
            <p className="text-muted-foreground">{message}</p>
            {showBackButton && <Button
                onClick={customBackAction ?? (() => router.back())} >
                Go back
            </Button>
            }
        </div>
    );
}
