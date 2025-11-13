# MongoDB & API Client Documentation

This directory contains the MongoDB connection client and reusable API client for the frontend application.

## Files Overview

- `mongodb.ts` - MongoDB singleton client with HMR support
- `api-client.ts` - Reusable generic API client using Axios
- `utils.ts` - Existing utility functions

## MongoDB Client (`mongodb.ts`)

### Features
- ✅ Singleton pattern to prevent multiple connections
- ✅ HMR (Hot Module Replacement) support for development
- ✅ Production-optimized connection handling
- ✅ Helper functions for database and collection access
- ✅ Connection health check

### Usage

#### Basic Usage

```typescript
import clientPromise, { getDatabase, getCollection } from '@/lib/mongodb';

// Get database instance
const db = await getDatabase();

// Get specific collection
const users = await getCollection('users');

// Query documents
const allUsers = await users.find({}).toArray();
```

#### In API Routes

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  const collection = await getCollection('your_collection');
  const data = await collection.find({}).toArray();
  
  return NextResponse.json({ success: true, data });
}
```

#### Health Check

```typescript
import { checkConnection } from '@/lib/mongodb';

const isHealthy = await checkConnection();
console.log('MongoDB is', isHealthy ? 'connected' : 'disconnected');
```

### Environment Variables Required

```env
MONGODB_URI=mongodb://localhost:27017/your_database_name
# OR for MongoDB Atlas
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database
```

## API Client (`api-client.ts`)

### Features
- ✅ Support for all HTTP methods (GET, POST, PUT, PATCH, DELETE)
- ✅ Automatic request/response interceptors
- ✅ Error handling with consistent response format
- ✅ Authentication token management
- ✅ Request/response logging in development
- ✅ Configurable timeouts and base URL
- ✅ TypeScript support with generics

### Usage

#### Basic Usage

```typescript
import apiClient from '@/lib/api-client';

// GET request
const response = await apiClient.get('/api/users');
if (response.success) {
  console.log(response.data);
}

// POST request
const newUser = await apiClient.post('/api/users', {
  name: 'John Doe',
  email: 'john@example.com'
});

// PUT request (full update)
const updated = await apiClient.put('/api/users', {
  id: '123',
  name: 'Jane Doe',
  email: 'jane@example.com'
});

// PATCH request (partial update)
const patched = await apiClient.patch('/api/users', {
  id: '123',
  name: 'Jane Smith'
});

// DELETE request
const deleted = await apiClient.delete('/api/users?id=123');
```

#### With TypeScript Types

```typescript
type User = {
  id: string;
  name: string;
  email: string;
};

const response = await apiClient.get<User[]>('/api/users');
if (response.success && response.data) {
  response.data.forEach(user => {
    console.log(user.name); // TypeScript knows the structure
  });
}
```

#### With Request Options

```typescript
// With query parameters
const users = await apiClient.get('/api/users', {
  params: { limit: 10, skip: 0 }
});

// With custom headers
const data = await apiClient.post('/api/data', payload, {
  headers: { 'X-Custom-Header': 'value' }
});

// With timeout
const response = await apiClient.get('/api/slow-endpoint', {
  timeout: 60000 // 60 seconds
});

// With abort signal
const controller = new AbortController();
const response = await apiClient.get('/api/data', {
  signal: controller.signal
});
// Later: controller.abort();
```

#### Authentication

```typescript
// Set auth token (stored in localStorage)
apiClient.setAuthToken('your-jwt-token');

// Clear auth token
apiClient.clearAuthToken();

// Token is automatically added to requests via interceptor
```

#### Custom Instance

```typescript
import { createApiClient } from '@/lib/api-client';

// Create a custom instance for a different API
const externalApi = createApiClient({
  baseURL: 'https://api.external.com',
  timeout: 10000,
  headers: { 'X-API-Key': 'your-key' }
});

const data = await externalApi.get('/endpoint');
```

#### Advanced: Access Axios Instance

```typescript
import apiClient from '@/lib/api-client';

const axiosInstance = apiClient.getAxiosInstance();
// Use axios directly if needed for advanced features
```

### Response Format

All API client methods return a consistent response format:

```typescript
type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  status?: number; // Only present on errors
};
```

### Environment Variables (Optional)

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
NEXT_PUBLIC_API_TIMEOUT=30000
```

## Example: Using in React Components

### With useState Hook

```typescript
'use client';

import { useState, useEffect } from 'react';
import apiClient from '@/lib/api-client';

type User = {
  id: string;
  name: string;
  email: string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUsers() {
      const response = await apiClient.get<User[]>('/api/users');
      if (response.success && response.data) {
        setUsers(response.data);
      }
      setLoading(false);
    }
    fetchUsers();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {users.map(user => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
}
```

### With Custom Hook

```typescript
// hooks/useUsers.ts
import { useState, useEffect } from 'react';
import apiClient from '@/lib/api-client';

type User = {
  id: string;
  name: string;
  email: string;
};

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUsers() {
      const response = await apiClient.get<User[]>('/api/users');
      if (response.success && response.data) {
        setUsers(response.data);
      } else {
        setError(response.error || 'Failed to fetch users');
      }
      setLoading(false);
    }
    fetchUsers();
  }, []);

  const createUser = async (user: Omit<User, 'id'>) => {
    const response = await apiClient.post<User>('/api/users', user);
    if (response.success && response.data) {
      setUsers([...users, response.data]);
    }
    return response;
  };

  const updateUser = async (id: string, updates: Partial<User>) => {
    const response = await apiClient.patch('/api/users', { id, ...updates });
    if (response.success) {
      setUsers(users.map(u => u.id === id ? { ...u, ...updates } : u));
    }
    return response;
  };

  const deleteUser = async (id: string) => {
    const response = await apiClient.delete(`/api/users?id=${id}`);
    if (response.success) {
      setUsers(users.filter(u => u.id !== id));
    }
    return response;
  };

  return {
    users,
    loading,
    error,
    createUser,
    updateUser,
    deleteUser,
  };
}

// Usage in component
export default function UsersPage() {
  const { users, loading, error, createUser, deleteUser } = useUsers();

  // Use the hook data and methods...
}
```

## Setup Instructions

1. **Install MongoDB Driver** (if not already installed):
   ```bash
   # The mongodb package should be added to package.json
   ```

2. **Configure Environment Variables**:
   - Copy `.env.example` to `.env.local`
   - Fill in your MongoDB connection string and other values

3. **Test MongoDB Connection**:
   ```bash
   # Start your Next.js dev server
   npm run dev
   
   # Visit http://localhost:3003/api/health
   # Should return: { "success": true, "message": "MongoDB connection is healthy" }
   ```

4. **Start Using**:
   - Import the clients in your API routes or components
   - See example API route at `/app/api/example/route.ts`

## Best Practices

1. **Always handle errors**: Both clients return error information
2. **Use TypeScript types**: Define types for your data structures
3. **Close connections properly**: The MongoDB client handles this automatically
4. **Use environment variables**: Never hardcode sensitive information
5. **Create custom hooks**: Encapsulate API logic in reusable hooks
6. **Handle loading states**: Always show loading indicators during requests
7. **Validate data**: Validate request/response data on both client and server

## Troubleshooting

### MongoDB Connection Issues
- Verify `MONGODB_URI` is correct in `.env.local`
- Check if MongoDB server is running
- Ensure network connectivity (for MongoDB Atlas)
- Check firewall/security group settings

### API Client Issues
- Check if `NEXT_PUBLIC_API_BASE_URL` is set correctly
- Verify CORS settings if calling external APIs
- Check browser console for detailed error messages
- Ensure backend API routes are working

## Additional Resources

- [MongoDB Node.js Driver Docs](https://www.mongodb.com/docs/drivers/node/current/)
- [Axios Documentation](https://axios-http.com/docs/intro)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
