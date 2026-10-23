import { Skeleton } from '@/components/ui/skeleton';
import { PhoneFrame } from './PhoneFrame';

/** The phone's shape while the page loads. */
export function WebDialerSkeleton() {
    return (
        <PhoneFrame>
            <div className="flex flex-1 flex-col items-center gap-5 px-4 pt-4 pb-6" aria-busy="true">
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-12 w-3/4" />
                <div className="mt-auto grid grid-cols-3 gap-x-6 gap-y-3.5">
                    {Array.from({ length: 12 }, (_, i) => (
                        <Skeleton key={i} className="size-[4.5rem] rounded-full" />
                    ))}
                </div>
                <Skeleton className="size-[4.5rem] rounded-full" />
            </div>
        </PhoneFrame>
    );
}
