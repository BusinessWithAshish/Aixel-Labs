'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Coupon } from '@aixellabs/backend/db/types';
import { updateCoupon } from '@/app/actions/coupon-actions';
import { CreateCouponDialog } from './CreateCouponDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { CopyIcon, TicketIcon } from 'lucide-react';

type CouponsSectionProps = {
    coupons: Coupon[];
};

function formatUses(coupon: Coupon): string {
    if (coupon.maxRedemptions == null) {
        return `${coupon.redemptionCount} / ∞`;
    }
    return `${coupon.redemptionCount} / ${coupon.maxRedemptions}`;
}

function couponStatus(coupon: Coupon): { label: string; variant: 'green' | 'yellow' | 'red' | 'secondary' } {
    if (!coupon.isActive) {
        return { label: 'Inactive', variant: 'secondary' };
    }
    if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= Date.now()) {
        return { label: 'Expired', variant: 'red' };
    }
    if (coupon.maxRedemptions != null && coupon.redemptionCount >= coupon.maxRedemptions) {
        return { label: 'Exhausted', variant: 'yellow' };
    }
    return { label: 'Active', variant: 'green' };
}

export function CouponsSection({ coupons }: CouponsSectionProps) {
    const router = useRouter();
    const [createOpen, setCreateOpen] = useState(false);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    const handleCopy = async (code: string) => {
        try {
            await navigator.clipboard.writeText(code);
            toast.success('Code copied');
        } catch {
            toast.error('Could not copy code');
        }
    };

    const handleActiveChange = async (coupon: Coupon, isActive: boolean) => {
        if (!coupon._id || coupon.isActive === isActive) return;
        setTogglingId(coupon._id);
        const res = await updateCoupon({ id: coupon._id, isActive });
        if (res.success) {
            toast.success(isActive ? `Coupon ${coupon.code} activated` : `Coupon ${coupon.code} deactivated`);
            router.refresh();
        } else {
            toast.error(res.error ?? `Failed to ${isActive ? 'activate' : 'deactivate'} coupon`);
        }
        setTogglingId(null);
    };

    return (
        <section className="flex flex-col gap-4 border-t pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight">Coupons</h2>
                    <p className="text-sm text-muted-foreground">
                        Create codes that grant bonus credits when users redeem them.
                    </p>
                </div>
                <Button type="button" onClick={() => setCreateOpen(true)} className="gap-2 self-start sm:self-auto">
                    <TicketIcon className="size-4" aria-hidden />
                    Create coupon
                </Button>
            </div>

            {coupons.length === 0 ? (
                <p className="text-sm text-muted-foreground">No coupons yet. Create one to offer a signup bonus.</p>
            ) : (
                <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {coupons.map((coupon) => {
                        const status = couponStatus(coupon);
                        const switchId = `coupon-active-${coupon._id}`;
                        return (
                            <Card key={coupon._id}>
                                <CardHeader className="pb-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <CardTitle className="font-mono text-base tracking-wide">{coupon.code}</CardTitle>
                                        <Badge variant={status.variant}>{status.label}</Badge>
                                    </div>
                                    <CardDescription>
                                        {coupon.creditAmount.toLocaleString()} credit
                                        {coupon.creditAmount === 1 ? '' : 's'}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-3">
                                    <dl className="grid grid-cols-2 gap-2 text-sm">
                                        <div>
                                            <dt className="text-muted-foreground">Uses</dt>
                                            <dd className="tabular-nums font-medium">{formatUses(coupon)}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-muted-foreground">Expires</dt>
                                            <dd className="font-medium">
                                                {coupon.expiresAt
                                                    ? new Date(coupon.expiresAt).toLocaleDateString()
                                                    : 'Never'}
                                            </dd>
                                        </div>
                                    </dl>
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="gap-1.5"
                                            onClick={() => handleCopy(coupon.code)}
                                        >
                                            <CopyIcon className="size-3.5" aria-hidden />
                                            Copy
                                        </Button>
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                id={switchId}
                                                checked={coupon.isActive}
                                                disabled={togglingId === coupon._id}
                                                onCheckedChange={(checked) => handleActiveChange(coupon, checked)}
                                            />
                                            <Label htmlFor={switchId} className="text-sm font-normal cursor-pointer">
                                                Active
                                            </Label>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            <CreateCouponDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                onSuccess={() => router.refresh()}
            />
        </section>
    );
}
