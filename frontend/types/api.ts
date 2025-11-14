
export type TApiResponse<T> = {
    success: boolean,
    data?: T
}

// MongoDB document base type
export type MongoDocument = {
    _id?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

// API pagination type
export type Pagination = {
    total: number;
    limit: number;
    skip: number;
    hasMore: boolean;
}

// Extended API response with pagination
export type PaginatedApiResponse<T> = TApiResponse<T> & {
    pagination?: Pagination;
}

// API error response type
export type ApiError = {
    success: false;
    error: string;
    message?: string;
    status?: number;
}