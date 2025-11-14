/**
 * API Client - Function-based approach for making HTTP requests
 * 
 * Usage:
 *   import apiClient from '@/lib/api-client';
 *   const response = await apiClient.get('/api/users');
 *   if (response.success) console.log(response.data);
 * 
 * Or import individual functions:
 *   import { get, post, put, patch, del } from '@/lib/api-client';
 *   const response = await get('/api/users');
 */

import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from 'axios';

/**
 * API Response type for consistent response handling
 */
export type ApiResponse<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

/**
 * Configuration options for the API client
 */
export type ApiClientConfig = {
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
  withCredentials?: boolean;
};

/**
 * Request options for API calls
 */
export type RequestOptions = {
  params?: Record<string, any>;
  headers?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
};

// Create axios instance
const createAxiosInstance = (config?: ApiClientConfig): AxiosInstance => {
  const baseURL = config?.baseURL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
  
  const instance = axios.create({
    baseURL,
    timeout: config?.timeout || 30000,
    headers: {
      'Content-Type': 'application/json',
      ...config?.headers,
    },
    withCredentials: config?.withCredentials ?? true,
  });

  // Request interceptor
  instance.interceptors.request.use(
    (config) => {
      const token = getAuthToken();
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`, {
          params: config.params,
          data: config.data,
        });
      }
      
      return config;
    },
    (error: AxiosError) => Promise.reject(error)
  );

  // Response interceptor
  instance.interceptors.response.use(
    (response: AxiosResponse) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[API] Response ${response.config.url}`, response.data);
      }
      return response;
    },
    (error: AxiosError) => handleError(error)
  );

  return instance;
};

// Default axios instance
let defaultInstance = createAxiosInstance();

/**
 * Get authentication token from storage
 */
const getAuthToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || null;
};

/**
 * Handle API errors
 */
const handleError = (error: AxiosError): Promise<never> => {
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data as any;

    if (process.env.NODE_ENV === 'development') {
      console.error(`[API] Error ${status}:`, data);
    }

    switch (status) {
      case 401:
        if (typeof window !== 'undefined') {
          console.warn('[API] Unauthorized access');
        }
        break;
      case 403:
        console.warn('[API] Forbidden access');
        break;
      case 404:
        console.warn('[API] Resource not found');
        break;
      case 500:
        console.error('[API] Server error');
        break;
    }

    return Promise.reject({
      success: false,
      error: data?.error || data?.message || 'Request failed',
      status,
    });
  } else if (error.request) {
    console.error('[API] No response received:', error.message);
    return Promise.reject({
      success: false,
      error: 'Network error - no response from server',
    });
  } else {
    console.error('[API] Request setup error:', error.message);
    return Promise.reject({
      success: false,
      error: error.message || 'Request failed',
    });
  }
};

/**
 * Merge request options with defaults
 */
const mergeConfig = (options?: RequestOptions): AxiosRequestConfig => ({
  params: options?.params,
  headers: options?.headers,
  timeout: options?.timeout,
  signal: options?.signal,
});

/**
 * GET request
 */
export const get = async <T = any>(
  url: string,
  options?: RequestOptions
): Promise<ApiResponse<T>> => {
  try {
    const response = await defaultInstance.get<T>(url, mergeConfig(options));
    return {
      success: true,
      data: response.data,
    };
  } catch (error: any) {
    return error;
  }
};

/**
 * POST request
 */
export const post = async <T = any>(
  url: string,
  data?: any,
  options?: RequestOptions
): Promise<ApiResponse<T>> => {
  try {
    const response = await defaultInstance.post<T>(url, data, mergeConfig(options));
    return {
      success: true,
      data: response.data,
    };
  } catch (error: any) {
    return error;
  }
};

/**
 * PUT request
 */
export const put = async <T = any>(
  url: string,
  data?: any,
  options?: RequestOptions
): Promise<ApiResponse<T>> => {
  try {
    const response = await defaultInstance.put<T>(url, data, mergeConfig(options));
    return {
      success: true,
      data: response.data,
    };
  } catch (error: any) {
    return error;
  }
};

/**
 * PATCH request
 */
export const patch = async <T = any>(
  url: string,
  data?: any,
  options?: RequestOptions
): Promise<ApiResponse<T>> => {
  try {
    const response = await defaultInstance.patch<T>(url, data, mergeConfig(options));
    return {
      success: true,
      data: response.data,
    };
  } catch (error: any) {
    return error;
  }
};

/**
 * DELETE request
 */
export const del = async <T = any>(
  url: string,
  options?: RequestOptions
): Promise<ApiResponse<T>> => {
  try {
    const response = await defaultInstance.delete<T>(url, mergeConfig(options));
    return {
      success: true,
      data: response.data,
    };
  } catch (error: any) {
    return error;
  }
};

/**
 * Set authentication token
 */
export const setAuthToken = (token: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('auth_token', token);
  }
};

/**
 * Clear authentication token
 */
export const clearAuthToken = (): void => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('auth_token');
    sessionStorage.removeItem('auth_token');
  }
};

/**
 * Get base URL
 */
export const getBaseURL = (): string => {
  return defaultInstance.defaults.baseURL || '';
};

/**
 * Update base URL
 */
export const setBaseURL = (url: string): void => {
  defaultInstance.defaults.baseURL = url;
};

/**
 * Get raw axios instance for advanced usage
 */
export const getAxiosInstance = (): AxiosInstance => {
  return defaultInstance;
};

/**
 * Create a new API client instance with custom configuration
 */
export const createApiClient = (config?: ApiClientConfig) => {
  const instance = createAxiosInstance(config);

  return {
    get: async <T = any>(url: string, options?: RequestOptions): Promise<ApiResponse<T>> => {
      try {
        const response = await instance.get<T>(url, mergeConfig(options));
        return { success: true, data: response.data };
      } catch (error: any) {
        return error;
      }
    },
    post: async <T = any>(url: string, data?: any, options?: RequestOptions): Promise<ApiResponse<T>> => {
      try {
        const response = await instance.post<T>(url, data, mergeConfig(options));
        return { success: true, data: response.data };
      } catch (error: any) {
        return error;
      }
    },
    put: async <T = any>(url: string, data?: any, options?: RequestOptions): Promise<ApiResponse<T>> => {
      try {
        const response = await instance.put<T>(url, data, mergeConfig(options));
        return { success: true, data: response.data };
      } catch (error: any) {
        return error;
      }
    },
    patch: async <T = any>(url: string, data?: any, options?: RequestOptions): Promise<ApiResponse<T>> => {
      try {
        const response = await instance.patch<T>(url, data, mergeConfig(options));
        return { success: true, data: response.data };
      } catch (error: any) {
        return error;
      }
    },
    delete: async <T = any>(url: string, options?: RequestOptions): Promise<ApiResponse<T>> => {
      try {
        const response = await instance.delete<T>(url, mergeConfig(options));
        return { success: true, data: response.data };
      } catch (error: any) {
        return error;
      }
    },
    getInstance: () => instance,
  };
};

// Default export with all methods
const apiClient = {
  get,
  post,
  put,
  patch,
  delete: del,
  setAuthToken,
  clearAuthToken,
  getBaseURL,
  setBaseURL,
  getAxiosInstance,
};

export default apiClient;
