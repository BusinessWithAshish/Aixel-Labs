'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { redeemCoupon } from '@/app/actions/coupon-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export function RedeemCouponForm() {
    const router = useRouter();
    const [code, setCode] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        const trimmed = code.trim();
        if (!trimmed) {
            toast.error('Enter a coupon code');
            return;
        }

        setIsSubmitting(true);
        const res = await redeemCoupon(trimmed);
        setIsSubmitting(false);

        if (res.success && res.data) {
            toast.success(`Added ${res.data.creditAmount.toLocaleString()} credits`, {
                description: `New balance: ${res.data.remainingCredits.toLocaleString()}`,
            });
            setCode('');
            router.refresh();
            return;
        }

        toast.error(res.error ?? 'Could not redeem coupon');
    };

    return (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 border-t pt-4">
            <div className="space-y-1.5">
                <Label htmlFor="coupon-code">Have a coupon code?</Label>
                <p className="text-xs text-muted-foreground">Redeem a code to add bonus credits to your balance.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                    id="coupon-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="WELCOME50"
                    autoComplete="off"
                    disabled={isSubmitting}
                    className="sm:flex-1 font-mono uppercase"
                />
                <Button type="submit" disabled={isSubmitting} className="sm:shrink-0">
                    {isSubmitting ? 'Redeeming…' : 'Redeem'}
                </Button>
            </div>
        </form>
    );
}
