import axios, { AxiosRequestConfig } from 'axios';
import { BACKEND_URL } from '@/config/app-config';
import type { ALApiResponse } from '@aixellabs/backend/api/types';
import { toast } from 'sonner';

export type RequestOptions = {
    params?: Record<string, string | number | boolean>;
    headers?: Record<string, string>;
    timeout?: number;
    signal?: AbortSignal;
};

const axiosInstance = axios.create({
    baseURL: BACKEND_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
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

        toast.error(errorMessage);

        return {
            success: false,
            error: errorMessage,
        } as ALApiResponse<never>;
    }

    const message = error instanceof Error ? error.message : 'Request failed';

    toast.error(message);

    return {
        success: false,
        error: message,
    } as ALApiResponse<never>;
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
