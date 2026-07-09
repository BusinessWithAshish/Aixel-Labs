import 'server-only';

import axios, { AxiosRequestConfig } from 'axios';
import type { ALApiResponse } from '@aixellabs/backend/api/types';

export type RequestOptions = {
    params?: Record<string, string | number | boolean>;
    headers?: Record<string, string>;
    timeout?: number;
    signal?: AbortSignal;
};

function getBackendUrl(): string {
    const url = process.env.BE_API?.trim();
    if (!url) {
        throw new Error('BE_API is not configured');
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
    return config;
});

const toAxiosConfig = (options?: RequestOptions): AxiosRequestConfig => ({
    params: options?.params,
    headers: options?.headers,
    timeout: options?.timeout,
    signal: options?.signal,
});

const toErrorResponse = (error: unknown): ALApiResponse<never> => {
    if (axios.isAxiosError(error)) {
        const data = error.response?.data as ALApiResponse<never> | undefined;

        const errorMessage = data?.error ?? (error.message || 'Request failed');

        return {
            success: false,
            error: errorMessage,
        } as ALApiResponse<never>;
    }

    const message = error instanceof Error ? error.message : 'Request failed';

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
