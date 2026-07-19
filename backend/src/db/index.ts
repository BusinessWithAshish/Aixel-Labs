import getClientPromise from "./mongo-client";
import type { ObjectId } from "mongodb";

export type { ObjectId, Document, Collection, Db, MongoClient } from "mongodb";
export { ObjectId as MongoObjectId } from "mongodb";
export * from "./types";
export type TenantDoc = import("./types").TenantDoc<ObjectId>;
export type UserDoc = import("./types").UserDoc<ObjectId>;
export type LeadDoc = import("./types").LeadDoc<ObjectId>;
export type UserLeadDoc = import("./types").UserLeadDoc<ObjectId>;
export type CouponDoc = import("./types").CouponDoc<ObjectId>;
export type CouponRedemptionDoc = import("./types").CouponRedemptionDoc<ObjectId>;
export {
  getDatabase,
  getCollection,
  checkConnection,
} from "./mongo-client";
export default getClientPromise;
