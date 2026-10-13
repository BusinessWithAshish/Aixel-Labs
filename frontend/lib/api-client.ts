import 'server-only';

import axios, { AxiosRequestConfig } from 'axios';
import type { ALApiResponse } from '@aixellabs/backend/api/types';
import { API_SECRET_HEADER } from '@aixellabs/backend/config';

export type RequestOptions = {
    params?: Record<string, string | number | boolean>;
    headers?: Record<string, string>;
    timeout?: number;
    signal?: AbortSignal;
};

function getBackendUrl(): string {
    const url = process.env.BE_API?.trim();
    if (!url) {
        throw new Error('Backend URL is not configured');
    }
    return url;
}

const axiosInstance = axios.create({
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

axiosInstance.interceptors.request.use((config) => {
    config.baseURL = getBackendUrl();
    const apiSecret = process.env.AIXEL_API_SECRET?.trim();
    if (apiSecret) config.headers.set(API_SECRET_HEADER, apiSecret);
    return config;
});

const toAxiosConfig = (options?: RequestOptions): AxiosRequestConfig => ({
    params: options?.params,
    headers: options?.headers,
    timeout: options?.timeout,
    signal: options?.signal,
});

const BACKEND_UNAVAILABLE_ERROR = 'Service is temporarily unavailable';
const BACKEND_TIMEOUT_ERROR = 'Request timed out';
const BACKEND_CANCELLED_ERROR = 'Request cancelled';
const TIMEOUT_ERROR_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT']);

/**
 * These results travel on to the browser (route handlers and server actions
 * return `error` as-is), so the backend address must never be part of them.
 * Strips the configured origin / host from any message as a last line of defence.
 */
function redactBackendAddress(message: string): string {
    const backendUrl = process.env.BE_API?.trim();
    if (!backendUrl) return message;

    let redacted = message.split(backendUrl.replace(/\/$/, '')).join('[backend]');
    try {
        const { host, hostname } = new URL(backendUrl);
        redacted = redacted.split(host).join('[backend]').split(hostname).join('[backend]');
    } catch {
        // BE_API is not a URL — nothing more to strip
    }
    return redacted;
}

const toErrorResponse = (error: unknown): ALApiResponse<never> => {
    if (axios.isAxiosError(error)) {
        const data = error.response?.data as ALApiResponse<never> | undefined;

        // Without a backend response, axios/Node messages name the address that was dialled
        // (`connect ECONNREFUSED <ip>:<port>`, `getaddrinfo ENOTFOUND <host>`, TLS altname errors).
        let errorMessage = BACKEND_UNAVAILABLE_ERROR;
        if (typeof data?.error === 'string' && data.error) errorMessage = redactBackendAddress(data.error);
        else if (error.response) errorMessage = `Request failed (${error.response.status})`;
        else if (axios.isCancel(error)) errorMessage = BACKEND_CANCELLED_ERROR;
        else if (error.code && TIMEOUT_ERROR_CODES.has(error.code)) errorMessage = BACKEND_TIMEOUT_ERROR;

        return {
            success: false,
            error: errorMessage,
        } as ALApiResponse<never>;
    }

    const message = error instanceof Error ? redactBackendAddress(error.message) : 'Request failed';

    return {
        success: false,
        error: message,
    };
};

export const get = async <T = unknown>(url: string, options?: RequestOptions): Promise<ALApiResponse<T>> => {
    try {
        const response = await axiosInstance.get<ALApiResponse<T>>(url, toAxiosConfig(options));
        return response.data;
    } catch (error) {
        return toErrorResponse(error) as ALApiResponse<T>;
    }
};

export const post = async <T = unknown, D = unknown>(
    url: string,
    data?: D,
    options?: RequestOptions,
): Promise<ALApiResponse<T>> => {
    try {
        const response = await axiosInstance.post<ALApiResponse<T>>(url, data, toAxiosConfig(options));
        return response.data;
    } catch (error) {
        return toErrorResponse(error) as ALApiResponse<T>;
    }
};

export const put = async <T = unknown, D = unknown>(
    url: string,
    data?: D,
    options?: RequestOptions,
): Promise<ALApiResponse<T>> => {
    try {
        const response = await axiosInstance.put<ALApiResponse<T>>(url, data, toAxiosConfig(options));
        return response.data;
    } catch (error) {
        return toErrorResponse(error) as ALApiResponse<T>;
    }
};

export const patch = async <T = unknown, D = unknown>(
    url: string,
    data?: D,
    options?: RequestOptions,
): Promise<ALApiResponse<T>> => {
    try {
        const response = await axiosInstance.patch<ALApiResponse<T>>(url, data, toAxiosConfig(options));
        return response.data;
    } catch (error) {
        return toErrorResponse(error) as ALApiResponse<T>;
    }
};

export const del = async <T = unknown>(url: string, options?: RequestOptions): Promise<ALApiResponse<T>> => {
    try {
        const response = await axiosInstance.delete<ALApiResponse<T>>(url, toAxiosConfig(options));
        return response.data;
    } catch (error) {
        return toErrorResponse(error) as ALApiResponse<T>;
    }
};

const apiClient = {
    get,
    post,
    put,
    patch,
    delete: del,
};

export default apiClient;
