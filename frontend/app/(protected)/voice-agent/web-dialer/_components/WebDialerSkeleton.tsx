import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** The phone's shape while the page loads. */
export function WebDialerSkeleton() {
    return (
        <Card className="mx-auto h-auto w-full max-w-sm gap-0 py-0" aria-busy="true">
            <CardHeader className="border-b py-4 [.border-b]:pb-4">
                <Skeleton className="h-10 w-full" />
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-5 px-4 py-6">
                <Skeleton className="h-12 w-3/4" />
                <div className="grid grid-cols-3 gap-4">
                    {Array.from({ length: 12 }, (_, i) => (
                        <Skeleton key={i} className="h-16 w-16 rounded-full" />
                    ))}
                </div>
                <Skeleton className="h-14 w-14 rounded-full" />
            </CardContent>
        </Card>
    );
}
