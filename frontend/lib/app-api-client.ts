import axios, { AxiosRequestConfig } from 'axios';
import type { ALApiResponse } from '@aixellabs/backend/api/types';

export type AppRequestOptions = {
    params?: Record<string, string | number | boolean>;
    headers?: Record<string, string>;
    timeout?: number;
    signal?: AbortSignal;
};

/** Same-origin Axios client for Next.js `/api/*` routes (browser-safe). */
const axiosInstance = axios.create({
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

const toAxiosConfig = (options?: AppRequestOptions): AxiosRequestConfig => ({
    params: options?.params,
    headers: options?.headers,
    timeout: options?.timeout,
    signal: options?.signal,
});

export function isAbortOrCancel(error: unknown): boolean {
    if (axios.isCancel(error)) return true;
    if (axios.isAxiosError(error) && error.code === 'ERR_CANCELED') return true;
    return (
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && (error.name === 'AbortError' || error.name === 'CanceledError'))
    );
}

const toErrorResponse = (error: unknown): ALApiResponse<never> => {
    if (axios.isAxiosError(error)) {
        const data = error.response?.data as ALApiResponse<never> | undefined;
        return {
            success: false,
            error: data?.error ?? (error.message || 'Request failed'),
        } as ALApiResponse<never>;
    }

    const message = error instanceof Error ? error.message : 'Request failed';
    return {
        success: false,
        error: message,
    };
};

export const get = async <T = unknown>(url: string, options?: AppRequestOptions): Promise<ALApiResponse<T>> => {
    try {
        const response = await axiosInstance.get<ALApiResponse<T>>(url, toAxiosConfig(options));
        return response.data;
    } catch (error) {
        if (isAbortOrCancel(error)) throw error;
        return toErrorResponse(error) as ALApiResponse<T>;
    }
};

export const post = async <T = unknown, D = unknown>(
    url: string,
    data?: D,
    options?: AppRequestOptions,
): Promise<ALApiResponse<T>> => {
    try {
        const response = await axiosInstance.post<ALApiResponse<T>>(url, data, toAxiosConfig(options));
        return response.data;
    } catch (error) {
        if (isAbortOrCancel(error)) throw error;
        return toErrorResponse(error) as ALApiResponse<T>;
    }
};

const appApiClient = {
    get,
    post,
};

export default appApiClient;
