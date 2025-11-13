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

/**
 * Generic API Client class with support for all HTTP methods
 * Provides a consistent interface for making API requests
 */
class ApiClient {
  private instance: AxiosInstance;
  private baseURL: string;

  constructor(config?: ApiClientConfig) {
    this.baseURL = config?.baseURL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
    
    this.instance = axios.create({
      baseURL: this.baseURL,
      timeout: config?.timeout || 30000, // 30 seconds default
      headers: {
        'Content-Type': 'application/json',
        ...config?.headers,
      },
      withCredentials: config?.withCredentials ?? true,
    });

    this.setupInterceptors();
  }

  /**
   * Setup request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.instance.interceptors.request.use(
      (config) => {
        // Add auth token if available
        const token = this.getAuthToken();
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        // Log request in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`, {
            params: config.params,
            data: config.data,
          });
        }
        
        return config;
      },
      (error: AxiosError) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.instance.interceptors.response.use(
      (response: AxiosResponse) => {
        // Log response in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`[API] Response ${response.config.url}`, response.data);
        }
        return response;
      },
      (error: AxiosError) => {
        // Handle errors globally
        return this.handleError(error);
      }
    );
  }

  /**
   * Get authentication token from storage
   */
  private getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    
    // Try to get token from localStorage, sessionStorage, or cookies
    return localStorage.getItem('auth_token') || 
           sessionStorage.getItem('auth_token') || 
           null;
  }

  /**
   * Handle API errors
   */
  private handleError(error: AxiosError): Promise<never> {
    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const data = error.response.data as any;

      if (process.env.NODE_ENV === 'development') {
        console.error(`[API] Error ${status}:`, data);
      }

      // Handle specific error codes
      switch (status) {
        case 401:
          // Unauthorized - redirect to login or refresh token
          if (typeof window !== 'undefined') {
            // You can add custom logic here
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
      // Request made but no response received
      console.error('[API] No response received:', error.message);
      return Promise.reject({
        success: false,
        error: 'Network error - no response from server',
      });
    } else {
      // Error in request setup
      console.error('[API] Request setup error:', error.message);
      return Promise.reject({
        success: false,
        error: error.message || 'Request failed',
      });
    }
  }

  /**
   * Merge request options with defaults
   */
  private mergeConfig(options?: RequestOptions): AxiosRequestConfig {
    return {
      params: options?.params,
      headers: options?.headers,
      timeout: options?.timeout,
      signal: options?.signal,
    };
  }

  /**
   * GET request
   */
  async get<T = any>(
    url: string,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    try {
      const response = await this.instance.get<T>(url, this.mergeConfig(options));
      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      return error;
    }
  }

  /**
   * POST request
   */
  async post<T = any>(
    url: string,
    data?: any,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    try {
      const response = await this.instance.post<T>(url, data, this.mergeConfig(options));
      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      return error;
    }
  }

  /**
   * PUT request
   */
  async put<T = any>(
    url: string,
    data?: any,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    try {
      const response = await this.instance.put<T>(url, data, this.mergeConfig(options));
      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      return error;
    }
  }

  /**
   * PATCH request
   */
  async patch<T = any>(
    url: string,
    data?: any,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    try {
      const response = await this.instance.patch<T>(url, data, this.mergeConfig(options));
      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      return error;
    }
  }

  /**
   * DELETE request
   */
  async delete<T = any>(
    url: string,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    try {
      const response = await this.instance.delete<T>(url, this.mergeConfig(options));
      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      return error;
    }
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  /**
   * Clear authentication token
   */
  clearAuthToken(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      sessionStorage.removeItem('auth_token');
    }
  }

  /**
   * Get base URL
   */
  getBaseURL(): string {
    return this.baseURL;
  }

  /**
   * Update base URL
   */
  setBaseURL(url: string): void {
    this.baseURL = url;
    this.instance.defaults.baseURL = url;
  }

  /**
   * Get raw axios instance for advanced usage
   */
  getAxiosInstance(): AxiosInstance {
    return this.instance;
  }
}

// Create and export a default instance
const apiClient = new ApiClient();

export default apiClient;

/**
 * Create a new API client instance with custom configuration
 */
export function createApiClient(config?: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}
