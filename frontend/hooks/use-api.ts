import { useState, useCallback } from 'react';
import apiClient, { ApiResponse, RequestOptions } from '@/lib/api-client';

/**
 * Generic hook for API requests with loading and error states
 * @example
 * const { data, loading, error, execute } = useApi<User[]>();
 * await execute(() => apiClient.get('/api/users'));
 */
export function useApi<T = any>() {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (apiCall: () => Promise<ApiResponse<T>>) => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiCall();

        if (response.success && response.data) {
          setData(response.data);
          return response;
        } else {
          setError(response.error || 'Request failed');
          return response;
        }
      } catch (err: any) {
        const errorMessage = err.message || 'Unknown error occurred';
        setError(errorMessage);
        return {
          success: false,
          error: errorMessage,
        } as ApiResponse<T>;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return {
    data,
    loading,
    error,
    execute,
    reset,
  };
}

/**
 * Hook for GET requests with automatic execution
 * @param url - API endpoint URL
 * @param options - Request options
 * @param immediate - Whether to execute immediately (default: true)
 * @example
 * const { data, loading, error, refetch } = useGet<User[]>('/api/users');
 */
export function useGet<T = any>(
  url: string,
  options?: RequestOptions,
  immediate = true
) {
  const { data, loading, error, execute, reset } = useApi<T>();

  const fetch = useCallback(async () => {
    return execute(() => apiClient.get<T>(url, options));
  }, [url, options, execute]);

  // Auto-fetch on mount if immediate is true
  useState(() => {
    if (immediate) {
      fetch();
    }
  });

  return {
    data,
    loading,
    error,
    refetch: fetch,
    reset,
  };
}

/**
 * Hook for POST requests
 * @example
 * const { data, loading, error, post } = usePost<User>('/api/users');
 * await post({ name: 'John', email: 'john@example.com' });
 */
export function usePost<T = any>(url: string, options?: RequestOptions) {
  const { data, loading, error, execute, reset } = useApi<T>();

  const post = useCallback(
    async (body: any) => {
      return execute(() => apiClient.post<T>(url, body, options));
    },
    [url, options, execute]
  );

  return {
    data,
    loading,
    error,
    post,
    reset,
  };
}

/**
 * Hook for PUT requests
 * @example
 * const { data, loading, error, put } = usePut<User>('/api/users');
 * await put({ id: '123', name: 'Jane', email: 'jane@example.com' });
 */
export function usePut<T = any>(url: string, options?: RequestOptions) {
  const { data, loading, error, execute, reset } = useApi<T>();

  const put = useCallback(
    async (body: any) => {
      return execute(() => apiClient.put<T>(url, body, options));
    },
    [url, options, execute]
  );

  return {
    data,
    loading,
    error,
    put,
    reset,
  };
}

/**
 * Hook for PATCH requests
 * @example
 * const { data, loading, error, patch } = usePatch<User>('/api/users');
 * await patch({ id: '123', name: 'Jane' });
 */
export function usePatch<T = any>(url: string, options?: RequestOptions) {
  const { data, loading, error, execute, reset } = useApi<T>();

  const patch = useCallback(
    async (body: any) => {
      return execute(() => apiClient.patch<T>(url, body, options));
    },
    [url, options, execute]
  );

  return {
    data,
    loading,
    error,
    patch,
    reset,
  };
}

/**
 * Hook for DELETE requests
 * @example
 * const { data, loading, error, del } = useDelete('/api/users');
 * await del({ params: { id: '123' } });
 */
export function useDelete<T = any>(url: string, defaultOptions?: RequestOptions) {
  const { data, loading, error, execute, reset } = useApi<T>();

  const del = useCallback(
    async (options?: RequestOptions) => {
      const mergedOptions = { ...defaultOptions, ...options };
      return execute(() => apiClient.delete<T>(url, mergedOptions));
    },
    [url, defaultOptions, execute]
  );

  return {
    data,
    loading,
    error,
    delete: del,
    reset,
  };
}

/**
 * Hook for managing CRUD operations on a collection
 * @param baseUrl - Base URL for the collection (e.g., '/api/users')
 * @example
 * const users = useCrud<User>('/api/users');
 * await users.getAll();
 * await users.create({ name: 'John' });
 * await users.update('123', { name: 'Jane' });
 * await users.remove('123');
 */
export function useCrud<T = any>(baseUrl: string) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getAll = useCallback(async (options?: RequestOptions) => {
    setLoading(true);
    setError(null);

    const response = await apiClient.get<T[]>(baseUrl, options);

    if (response.success && response.data) {
      setItems(response.data);
    } else {
      setError(response.error || 'Failed to fetch items');
    }

    setLoading(false);
    return response;
  }, [baseUrl]);

  const getOne = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    const response = await apiClient.get<T>(`${baseUrl}/${id}`);

    setLoading(false);
    return response;
  }, [baseUrl]);

  const create = useCallback(async (data: Partial<T>) => {
    setLoading(true);
    setError(null);

    const response = await apiClient.post<T>(baseUrl, data);

    if (response.success && response.data) {
      setItems((prev) => [...prev, response.data as T]);
    } else {
      setError(response.error || 'Failed to create item');
    }

    setLoading(false);
    return response;
  }, [baseUrl]);

  const update = useCallback(async (id: string, data: Partial<T>) => {
    setLoading(true);
    setError(null);

    const response = await apiClient.put<T>(baseUrl, { id, ...data });

    if (response.success) {
      setItems((prev) =>
        prev.map((item: any) => (item.id === id ? { ...item, ...data } : item))
      );
    } else {
      setError(response.error || 'Failed to update item');
    }

    setLoading(false);
    return response;
  }, [baseUrl]);

  const patch = useCallback(async (id: string, data: Partial<T>) => {
    setLoading(true);
    setError(null);

    const response = await apiClient.patch<T>(baseUrl, { id, ...data });

    if (response.success) {
      setItems((prev) =>
        prev.map((item: any) => (item.id === id ? { ...item, ...data } : item))
      );
    } else {
      setError(response.error || 'Failed to patch item');
    }

    setLoading(false);
    return response;
  }, [baseUrl]);

  const remove = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    const response = await apiClient.delete(`${baseUrl}?id=${id}`);

    if (response.success) {
      setItems((prev) => prev.filter((item: any) => item.id !== id));
    } else {
      setError(response.error || 'Failed to delete item');
    }

    setLoading(false);
    return response;
  }, [baseUrl]);

  return {
    items,
    loading,
    error,
    getAll,
    getOne,
    create,
    update,
    patch,
    remove,
  };
}
