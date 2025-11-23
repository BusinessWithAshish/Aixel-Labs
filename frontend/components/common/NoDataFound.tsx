import { Button } from '../ui/button';
import { useRouter } from 'next/navigation';

export function NoDataFound() {
    const router = useRouter();

    return (
        <div className="flex items-center justify-center p-6">
            <p className="text-muted-foreground">No data found.</p>
            <Button variant="outline" onClick={() => router.back()}>
                Go back
            </Button>
        </div>
    );
}
