# Quick Reference - MongoDB & API Client

## 🚀 Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Setup environment
cp .env.example .env.local
# Edit .env.local with your MongoDB URI

# 3. Start server
pnpm dev

# 4. Test connection
curl http://localhost:3003/api/health
```

## 📦 Import Statements

```typescript
// MongoDB
import { getCollection, getDatabase, checkConnection } from '@/lib/mongodb';

// API Client
import apiClient from '@/lib/api-client';
import { createApiClient } from '@/lib/api-client';

// Hooks
import { useApi, useGet, usePost, usePut, usePatch, useDelete, useCrud } from '@/hooks/use-api';

// Types
import type { ApiResponse, RequestOptions } from '@/lib/api-client';
import type { MongoDocument, Pagination } from '@/types/api';
```

## 🔧 Common Patterns

### API Route (MongoDB)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  const collection = await getCollection('your_collection');
  const data = await collection.find({}).toArray();
  return NextResponse.json({ success: true, data });
}
```

### Component (API Client)

```typescript
'use client';
import apiClient from '@/lib/api-client';
import { useState, useEffect } from 'react';

export default function Page() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    apiClient.get('/api/endpoint').then(res => {
      if (res.success) setData(res.data);
    });
  }, []);
  
  return <div>{JSON.stringify(data)}</div>;
}
```

### Component (Hook)

```typescript
'use client';
import { useGet } from '@/hooks/use-api';

export default function Page() {
  const { data, loading, error } = useGet('/api/endpoint');
  
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  return <div>{JSON.stringify(data)}</div>;
}
```

## 📝 API Client Methods

```typescript
// GET
await apiClient.get<T>('/api/endpoint', { params: { id: 1 } });

// POST
await apiClient.post<T>('/api/endpoint', { name: 'value' });

// PUT
await apiClient.put<T>('/api/endpoint', { id: 1, name: 'value' });

// PATCH
await apiClient.patch<T>('/api/endpoint', { id: 1, name: 'value' });

// DELETE
await apiClient.delete<T>('/api/endpoint?id=1');
```

## 🪝 Hook Usage

```typescript
// Auto-fetch GET
const { data, loading, error, refetch } = useGet<User[]>('/api/users');

// Manual POST
const { data, loading, error, post } = usePost<User>('/api/users');
await post({ name: 'John' });

// CRUD operations
const { items, getAll, create, update, remove } = useCrud<User>('/api/users');
```

## 🗄️ MongoDB Operations

```typescript
import { getCollection } from '@/lib/mongodb';

const collection = await getCollection('users');

// Find all
const all = await collection.find({}).toArray();

// Find one
const one = await collection.findOne({ email: 'test@example.com' });

// Insert
const result = await collection.insertOne({ name: 'John' });

// Update
await collection.updateOne({ _id: id }, { $set: { name: 'Jane' } });

// Delete
await collection.deleteOne({ _id: id });

// Count
const count = await collection.countDocuments();
```

## 🔐 Authentication

```typescript
// Set token
apiClient.setAuthToken('your-jwt-token');

// Clear token
apiClient.clearAuthToken();
```

## ⚙️ Environment Variables

```env
MONGODB_URI=mongodb://localhost:27017/db_name
NEXT_PUBLIC_API_BASE_URL=http://localhost:3003
JWT_SECRET=your_secret_key
```

## 📂 File Locations

- MongoDB Client: `lib/mongodb.ts`
- API Client: `lib/api-client.ts`
- Hooks: `hooks/use-api.ts`
- Types: `types/api.ts`
- Example API: `app/api/example/route.ts`
- Health Check: `app/api/health/route.ts`

## 📚 Documentation

- Full Setup: `MONGODB_SETUP.md`
- Detailed Docs: `lib/README.md`
- Changes: `CHANGES_SUMMARY.md`

## 🐛 Quick Troubleshooting

**MongoDB not connecting?**
- Check `MONGODB_URI` in `.env.local`
- Verify MongoDB is running
- Visit `/api/health` to test

**TypeScript errors?**
- Run `pnpm install`
- Restart TS server

**API calls failing?**
- Check browser console
- Verify API route exists
- Check `NEXT_PUBLIC_API_BASE_URL`

---

**Need more details?** See `MONGODB_SETUP.md` or `lib/README.md`
