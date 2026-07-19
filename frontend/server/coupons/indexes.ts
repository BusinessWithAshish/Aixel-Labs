import 'server-only';

import {
    getCollection,
    MongoCollections,
    type CouponDoc,
    type CouponRedemptionDoc,
} from '@aixellabs/backend/db';

let indexesEnsured = false;

/** Unique coupon code per tenant + one redemption per user per coupon. */
export async function ensureCouponIndexes(): Promise<void> {
    if (indexesEnsured) return;

    const coupons = await getCollection<CouponDoc>(MongoCollections.COUPONS);
    const redemptions = await getCollection<CouponRedemptionDoc>(MongoCollections.COUPON_REDEMPTIONS);

    await Promise.all([
        coupons.createIndex({ tenantId: 1, code: 1 }, { unique: true }),
        coupons.createIndex({ tenantId: 1, isActive: 1 }),
        redemptions.createIndex({ couponId: 1, userId: 1 }, { unique: true }),
        redemptions.createIndex({ tenantId: 1, createdAt: 1 }),
    ]);

    indexesEnsured = true;
}
