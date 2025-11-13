# MongoDB & API Client Setup Guide

This guide will help you set up and use MongoDB with the reusable API client in your Next.js frontend application.

## 📦 What's Included

### 1. MongoDB Singleton Client (`lib/mongodb.ts`)
- ✅ Singleton pattern to prevent multiple connections
- ✅ HMR (Hot Module Replacement) support for development
- ✅ Production-optimized connection handling
- ✅ Helper functions for database and collection access
- ✅ Connection health check

### 2. Generic API Client (`lib/api-client.ts`)
- ✅ Support for all HTTP methods (GET, POST, PUT, PATCH, DELETE)
- ✅ Automatic request/response interceptors
- ✅ Error handling with consistent response format
- ✅ Authentication token management
- ✅ Request/response logging in development
- ✅ TypeScript support with generics

### 3. Custom React Hooks (`hooks/use-api.ts`)
- ✅ `useApi()` - Generic API request hook
- ✅ `useGet()` - GET request with auto-fetch
- ✅ `usePost()` - POST request hook
- ✅ `usePut()` - PUT request hook
- ✅ `usePatch()` - PATCH request hook
- ✅ `useDelete()` - DELETE request hook
- ✅ `useCrud()` - Complete CRUD operations hook

### 4. Example API Routes
- ✅ `/app/api/health/route.ts` - Health check endpoint
- ✅ `/app/api/example/route.ts` - Complete CRUD example

### 5. Type Definitions
- ✅ Enhanced types in `types/api.ts`

## 🚀 Quick Start

### Step 1: Install Dependencies

The `mongodb` package has been added to `package.json`. Install it:

```bash
cd /workspace/frontend
pnpm install
```

### Step 2: Configure Environment Variables

Create `.env.local` file in the frontend directory:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your MongoDB connection string:

```env
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/aixellabs_dev

# Or for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/aixellabs

# API Configuration (optional)
NEXT_PUBLIC_API_BASE_URL=http://localhost:3003

# Authentication (if using JWT)
JWT_SECRET=your_secret_key_change_in_production
```

### Step 3: Test MongoDB Connection

Start your development server:

```bash
pnpm dev
```

Visit http://localhost:3003/api/health

You should see:
```json
{
  "success": true,
  "message": "MongoDB connection is healthy",
  "timestamp": "2025-11-13T..."
}
```

## 📖 Usage Examples

### Example 1: Using MongoDB in API Routes

```typescript
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    const usersCollection = await getCollection('users');
    const users = await usersCollection.find({}).toArray();
    
    return NextResponse.json({
      success: true,
      data: users
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

### Example 2: Using API Client in Components

```typescript
// app/users/page.tsx
'use client';

import { useEffect, useState } from 'react';
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
      <h1>Users</h1>
      {users.map(user => (
        <div key={user.id}>
          {user.name} - {user.email}
        </div>
      ))}
    </div>
  );
}
```

### Example 3: Using Custom Hooks

```typescript
// app/users/page.tsx
'use client';

import { useGet, usePost, useDelete } from '@/hooks/use-api';

type User = {
  id: string;
  name: string;
  email: string;
};

export default function UsersPage() {
  // Auto-fetch on mount
  const { data: users, loading, error, refetch } = useGet<User[]>('/api/users');
  const { post: createUser } = usePost<User>('/api/users');
  const { delete: deleteUser } = useDelete('/api/users');

  const handleCreate = async () => {
    const response = await createUser({
      name: 'New User',
      email: 'new@example.com'
    });
    
    if (response.success) {
      refetch(); // Refresh the list
    }
  };

  const handleDelete = async (id: string) => {
    const response = await deleteUser({ params: { id } });
    if (response.success) {
      refetch(); // Refresh the list
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <button onClick={handleCreate}>Create User</button>
      {users?.map(user => (
        <div key={user.id}>
          {user.name}
          <button onClick={() => handleDelete(user.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
```

### Example 4: Using CRUD Hook

```typescript
// app/users/page.tsx
'use client';

import { useEffect } from 'react';
import { useCrud } from '@/hooks/use-api';

type User = {
  id: string;
  name: string;
  email: string;
};

export default function UsersPage() {
  const {
    items: users,
    loading,
    error,
    getAll,
    create,
    update,
    remove
  } = useCrud<User>('/api/users');

  useEffect(() => {
    getAll();
  }, [getAll]);

  const handleCreate = async () => {
    await create({ name: 'New User', email: 'new@example.com' });
  };

  const handleUpdate = async (id: string) => {
    await update(id, { name: 'Updated Name' });
  };

  const handleDelete = async (id: string) => {
    await remove(id);
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <button onClick={handleCreate}>Create User</button>
      {users.map(user => (
        <div key={user.id}>
          {user.name}
          <button onClick={() => handleUpdate(user.id)}>Update</button>
          <button onClick={() => handleDelete(user.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
```

## 🗂️ File Structure

```
frontend/
├── app/
│   └── api/
│       ├── health/
│       │   └── route.ts          # MongoDB health check
│       └── example/
│           └── route.ts          # Example CRUD API route
├── lib/
│   ├── mongodb.ts                # MongoDB singleton client
│   ├── api-client.ts             # Reusable API client
│   └── README.md                 # Detailed documentation
├── hooks/
│   └── use-api.ts                # Custom React hooks for API calls
├── types/
│   └── api.ts                    # API type definitions
├── .env.example                  # Environment variables template
├── .env.local.example            # Local dev environment template
└── MONGODB_SETUP.md             # This file
```

## 🔧 Advanced Usage

### Custom API Client Instance

```typescript
import { createApiClient } from '@/lib/api-client';

const externalApi = createApiClient({
  baseURL: 'https://api.external.com',
  timeout: 10000,
  headers: { 'X-API-Key': 'your-key' }
});

const data = await externalApi.get('/endpoint');
```

### Authentication

```typescript
import apiClient from '@/lib/api-client';

// Set auth token (stored in localStorage)
apiClient.setAuthToken('your-jwt-token');

// Token is automatically added to all requests

// Clear auth token
apiClient.clearAuthToken();
```

### MongoDB Collections with TypeScript

```typescript
import { getCollection } from '@/lib/mongodb';

type User = {
  _id?: string;
  name: string;
  email: string;
  createdAt: Date;
};

const users = await getCollection<User>('users');
const user = await users.findOne({ email: 'john@example.com' });
// TypeScript knows the structure of 'user'
```

## 🧪 Testing

### Test MongoDB Connection

```bash
curl http://localhost:3003/api/health
```

### Test API Endpoints

```bash
# GET request
curl http://localhost:3003/api/example

# POST request
curl -X POST http://localhost:3003/api/example \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com"}'

# DELETE request
curl -X DELETE "http://localhost:3003/api/example?id=123"
```

## 📝 Best Practices

1. **Always handle errors**: Check `response.success` before using data
2. **Use TypeScript types**: Define types for your data structures
3. **Create custom hooks**: Encapsulate API logic in reusable hooks
4. **Validate data**: Use Zod or similar for runtime validation
5. **Handle loading states**: Always show loading indicators
6. **Use environment variables**: Never hardcode sensitive data
7. **Add indexes**: Create MongoDB indexes for frequently queried fields
8. **Implement pagination**: Use skip/limit for large datasets

## 🐛 Troubleshooting

### MongoDB Connection Issues

**Problem**: "Failed to connect to MongoDB"

**Solutions**:
- Verify `MONGODB_URI` in `.env.local`
- Check if MongoDB server is running: `systemctl status mongodb`
- For MongoDB Atlas, check network access settings
- Verify firewall rules

### TypeScript Errors

**Problem**: Module not found

**Solutions**:
- Run `pnpm install` to install dependencies
- Check tsconfig.json path aliases
- Restart TypeScript server in your IDE

### API Client Issues

**Problem**: Requests failing with CORS errors

**Solutions**:
- Ensure you're using Next.js API routes (not external URLs)
- For external APIs, configure CORS on the backend
- Check `NEXT_PUBLIC_API_BASE_URL` in `.env.local`

## 📚 Additional Resources

- [MongoDB Node.js Driver Documentation](https://www.mongodb.com/docs/drivers/node/current/)
- [Axios Documentation](https://axios-http.com/docs/intro)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [React Hooks](https://react.dev/reference/react)

## 🎯 Next Steps

1. Create your first API route using the example template
2. Define your data types in TypeScript
3. Create custom hooks for your specific use cases
4. Add authentication if needed
5. Implement error handling and loading states
6. Add MongoDB indexes for performance

---

**Need Help?** Check the detailed documentation in `lib/README.md`
