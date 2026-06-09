import { MongoObjectId } from '@aixellabs/backend/db';

export function isValidObjectId(id: string): boolean {
    return MongoObjectId.isValid(id);
}
