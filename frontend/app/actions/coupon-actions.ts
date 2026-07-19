'use server';

import {
    getCollection,
    MongoCollections,
    MongoObjectId,
    type Coupon,
    type CouponDoc,
    type CouponRedemptionDoc,
    type UserDoc,
} from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import { mapMongoDocToClient } from '@/helpers/normalize-helpers';
import { normalizeCredits, parseCreditsInput } from '@/helpers/credits';
import { assertValidObjectId, runAuthenticatedAction } from '@/helpers/server-action-helpers';
import { requireAdminSessionContext, requireAppSession } from '@/server/auth';
import { ensureCouponIndexes } from '@/server/coupons/indexes';

const DUPLICATE_KEY_CODE = 11000;

export type CreateCouponInput = {
    code: string;
    creditAmount: number;
    maxRedemptions?: number | null;
    expiresAt?: string | null;
};

export type UpdateCouponInput = {
    id: string;
    isActive?: boolean;
    maxRedemptions?: number | null;
    expiresAt?: string | null;
};

export type RedeemCouponResult = {
    creditAmount: number;
    remainingCredits: number;
};

function normalizeCouponCode(code: string): string {
    return code.trim().toUpperCase().replace(/\s+/g, '');
}

function assertValidCouponCode(code: string): string {
    const normalized = normalizeCouponCode(code);
    if (!normalized || normalized.length < 3 || normalized.length > 64) {
        throw new Error('Coupon code must be 3–64 characters');
    }
    if (!/^[A-Z0-9_-]+$/.test(normalized)) {
        throw new Error('Coupon code may only contain letters, numbers, hyphens, and underscores');
    }
    return normalized;
}

function parseOptionalMaxRedemptions(value: unknown): number | null {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
        throw new Error('Max redemptions must be a positive integer or empty for unlimited');
    }
    return n;
}

function parseOptionalExpiresAt(value: string | null | undefined): Date | null {
    if (value === undefined || value === null || value.trim() === '') {
        return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error('Invalid expiry date');
    }
    return date;
}

function isDuplicateKeyError(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code: number }).code === DUPLICATE_KEY_CODE);
}

function mapCouponDocToCoupon(doc: CouponDoc): Coupon {
    const mapped = mapMongoDocToClient(doc);
    return {
        ...mapped,
        tenantId: doc.tenantId.toString(),
        createdByUserId: doc.createdByUserId.toString(),
        creditAmount: normalizeCredits(doc.creditAmount),
        redemptionCount: normalizeCredits(doc.redemptionCount),
        maxRedemptions: doc.maxRedemptions == null ? null : normalizeCredits(doc.maxRedemptions),
        expiresAt: doc.expiresAt ? doc.expiresAt.toISOString() : null,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
    };
}

function isCouponExpired(coupon: Pick<CouponDoc, 'expiresAt'>, now = new Date()): boolean {
    return coupon.expiresAt != null && coupon.expiresAt.getTime() <= now.getTime();
}

function isCouponExhausted(coupon: Pick<CouponDoc, 'maxRedemptions' | 'redemptionCount'>): boolean {
    return coupon.maxRedemptions != null && coupon.redemptionCount >= coupon.maxRedemptions;
}

/** Lists coupons for the caller's current session tenant. */
export const listCoupons = async (): Promise<ALApiResponse<Coupon[]>> =>
    runAuthenticatedAction(async function listCoupons() {
        const { tenantObjectId } = await requireAdminSessionContext();
        await ensureCouponIndexes();

        const coupons = await getCollection<CouponDoc>(MongoCollections.COUPONS);
        const docs = await coupons.find({ tenantId: tenantObjectId }).sort({ createdAt: -1 }).toArray();
        return docs.map(mapCouponDocToCoupon);
    });

/** Creates a coupon for the caller's current session tenant. */
export const createCoupon = async (input: CreateCouponInput): Promise<ALApiResponse<Coupon>> =>
    runAuthenticatedAction(async function createCoupon() {
        const { session, tenantObjectId } = await requireAdminSessionContext();
        await ensureCouponIndexes();

        const code = assertValidCouponCode(input.code);
        const creditAmount = parseCreditsInput(input.creditAmount);
        if (creditAmount < 1) {
            throw new Error('Credit amount must be at least 1');
        }
        const maxRedemptions = parseOptionalMaxRedemptions(input.maxRedemptions);
        const expiresAt = parseOptionalExpiresAt(input.expiresAt ?? null);
        if (expiresAt && expiresAt.getTime() <= Date.now()) {
            throw new Error('Expiry must be in the future');
        }

        const now = new Date();
        const doc: CouponDoc = {
            tenantId: tenantObjectId,
            code,
            creditAmount,
            maxRedemptions,
            redemptionCount: 0,
            expiresAt,
            isActive: true,
            createdByUserId: new MongoObjectId(session.user.id),
            createdAt: now,
            updatedAt: now,
        };

        const coupons = await getCollection<CouponDoc>(MongoCollections.COUPONS);
        try {
            const result = await coupons.insertOne(doc);
            return mapCouponDocToCoupon({ ...doc, _id: result.insertedId });
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                throw new Error('A coupon with this code already exists');
            }
            throw error;
        }
    });

/** Updates active flag, max redemptions, or expiry for a tenant coupon. */
export const updateCoupon = async (input: UpdateCouponInput): Promise<ALApiResponse<Coupon>> =>
    runAuthenticatedAction(async function updateCoupon() {
        const { tenantObjectId } = await requireAdminSessionContext();
        assertValidObjectId(input.id, 'Coupon ID');
        await ensureCouponIndexes();

        const coupons = await getCollection<CouponDoc>(MongoCollections.COUPONS);
        const existing = await coupons.findOne({ _id: new MongoObjectId(input.id), tenantId: tenantObjectId });
        if (!existing) {
            throw new Error('Coupon not found');
        }

        const update: Partial<CouponDoc> = { updatedAt: new Date() };
        if (input.isActive !== undefined) {
            update.isActive = input.isActive;
        }
        if (input.maxRedemptions !== undefined) {
            const maxRedemptions = parseOptionalMaxRedemptions(input.maxRedemptions);
            if (maxRedemptions != null && existing.redemptionCount > maxRedemptions) {
                throw new Error('Max redemptions cannot be below the current redemption count');
            }
            update.maxRedemptions = maxRedemptions;
        }
        if (input.expiresAt !== undefined) {
            const expiresAt = parseOptionalExpiresAt(input.expiresAt);
            if (expiresAt && expiresAt.getTime() <= Date.now()) {
                throw new Error('Expiry must be in the future');
            }
            update.expiresAt = expiresAt;
        }

        const updated = await coupons.findOneAndUpdate(
            { _id: existing._id, tenantId: tenantObjectId },
            { $set: update },
            { returnDocument: 'after' },
        );
        if (!updated) {
            throw new Error('Coupon not found');
        }
        return mapCouponDocToCoupon(updated);
    });

/** Soft-deactivates a coupon so it can no longer be redeemed. */
export const deactivateCoupon = async (id: string): Promise<ALApiResponse<Coupon>> =>
    updateCoupon({ id, isActive: false });

/**
 * Redeems a tenant-scoped coupon for the current non-admin user.
 * Capacity is reserved via atomic `$inc` on the coupon; unique redemption index prevents double redeem.
 */
export const redeemCoupon = async (code: string): Promise<ALApiResponse<RedeemCouponResult>> =>
    runAuthenticatedAction(async function redeemCoupon(userId) {
        const session = await requireAppSession();
        if (session.user.isAdmin) {
            throw new Error('Admins are outside the credits system and cannot redeem coupons');
        }

        await ensureCouponIndexes();
        const normalized = assertValidCouponCode(code);
        const userObjectId = new MongoObjectId(userId);

        const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
        const membership = await usersCollection.findOne(
            { _id: userObjectId },
            { projection: { tenantId: 1, isAdmin: 1 } },
        );
        if (!membership) {
            throw new Error('User not found');
        }
        if (membership.isAdmin) {
            throw new Error('Admins are outside the credits system and cannot redeem coupons');
        }

        const coupons = await getCollection<CouponDoc>(MongoCollections.COUPONS);
        const redemptions = await getCollection<CouponRedemptionDoc>(MongoCollections.COUPON_REDEMPTIONS);
        const now = new Date();

        const coupon = await coupons.findOne({
            tenantId: membership.tenantId,
            code: normalized,
        });
        if (!coupon?._id) {
            throw new Error('Invalid coupon code');
        }
        if (!coupon.isActive) {
            throw new Error('This coupon is no longer active');
        }
        if (isCouponExpired(coupon, now)) {
            throw new Error('This coupon has expired');
        }
        if (isCouponExhausted(coupon)) {
            throw new Error('This coupon has reached its redemption limit');
        }

        // Reserve capacity first (race-safe against maxRedemptions).
        const reserved = await coupons.findOneAndUpdate(
            {
                _id: coupon._id,
                tenantId: membership.tenantId,
                isActive: true,
                $and: [
                    {
                        $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
                    },
                    {
                        $or: [
                            { maxRedemptions: null },
                            { maxRedemptions: { $exists: false } },
                            { $expr: { $lt: ['$redemptionCount', '$maxRedemptions'] } },
                        ],
                    },
                ],
            },
            { $inc: { redemptionCount: 1 }, $set: { updatedAt: now } },
            { returnDocument: 'after' },
        );
        if (!reserved) {
            throw new Error('This coupon cannot be redeemed');
        }

        const redemptionDoc: CouponRedemptionDoc = {
            tenantId: membership.tenantId,
            couponId: coupon._id,
            userId: userObjectId,
            code: normalized,
            creditAmount: coupon.creditAmount,
            createdAt: now,
        };

        try {
            await redemptions.insertOne(redemptionDoc);
        } catch (error) {
            await coupons.updateOne({ _id: coupon._id }, { $inc: { redemptionCount: -1 }, $set: { updatedAt: new Date() } });
            if (isDuplicateKeyError(error)) {
                throw new Error('You have already redeemed this coupon');
            }
            throw error;
        }

        const updatedUser = await usersCollection.findOneAndUpdate(
            { _id: userObjectId, isAdmin: { $ne: true } },
            { $inc: { credits: coupon.creditAmount } },
            { returnDocument: 'after', projection: { credits: 1 } },
        );

        if (!updatedUser) {
            await redemptions.deleteOne({ couponId: coupon._id, userId: userObjectId });
            await coupons.updateOne({ _id: coupon._id }, { $inc: { redemptionCount: -1 }, $set: { updatedAt: new Date() } });
            throw new Error('Failed to apply coupon credits');
        }

        return {
            creditAmount: coupon.creditAmount,
            remainingCredits: normalizeCredits(updatedUser.credits),
        };
    });
