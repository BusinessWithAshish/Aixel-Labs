# PageStore Pattern

A Higher-Order Component (HoC) pattern for managing page-level state and business logic using React Context API.

## Overview

The PageStore pattern allows you to:
- **Centralize business logic**: Keep all page logic in a single custom hook
- **Eliminate prop drilling**: Use React Context API to access state anywhere in the component tree
- **Maintain type safety**: Full TypeScript support with generics
- **Improve code organization**: Separate concerns between logic and presentation
- **Support server-side data**: Leverage Next.js server components with client-side interactivity

## Components

### `PageProvider`
A generic provider component that wraps your page content and executes a custom hook. Supports both client-only hooks and hooks that consume server-side data.

### `usePage<T>()`
A hook to access the page context from any child component.

## Usage Patterns

### Pattern 1: Client-Side Only (No Server Data)

Use this when all data fetching and state management happens on the client side.

#### 1. Create a Custom Hook

```typescript
// _hooks/useMyPageLogic.ts
'use client';

export interface UseMyPageLogicReturn {
  data: string[];
  isLoading: boolean;
  handleAction: () => void;
}

export function useMyPageLogic(): UseMyPageLogicReturn {
  const [data, setData] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Fetch data on client side
    fetchData().then(setData);
  }, []);

  const handleAction = () => {
    // Your logic here
  };

  return {
    data,
    isLoading,
    handleAction,
  };
}
```

#### 2. Wrap Your Page

```typescript
// page.tsx
import { PageProvider } from "@/contexts/PageStore";
import { useMyPageLogic } from "./_hooks/useMyPageLogic";
import { MyPageContent } from "./_components/MyPageContent";

export default function MyPage() {
  return (
    <PageProvider usePageHook={useMyPageLogic}>
      <MyPageContent />
    </PageProvider>
  );
}
```

#### 3. Access State in Components

```typescript
// _components/MyPageContent.tsx
'use client';

import { usePage } from "@/contexts/PageStore";
import { UseMyPageLogicReturn } from "../_hooks/useMyPageLogic";

export function MyPageContent() {
  const { data, isLoading, handleAction } = usePage<UseMyPageLogicReturn>();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      {data.map(item => <div key={item}>{item}</div>)}
      <button onClick={handleAction}>Action</button>
    </div>
  );
}
```

---

### Pattern 2: With Server-Side Data

Use this when you want to fetch data on the server and handle client-side interactions with that data.

#### 1. Create a Custom Hook That Accepts Server Data

```typescript
// _hooks/useMyPageLogic.ts
'use client';

type ServerData = {
  items: Item[];
  metadata: Metadata;
};

export interface UseMyPageLogicReturn {
  items: Item[];
  selectedItem: Item | null;
  handleItemClick: (item: Item) => void;
  refreshItems: () => Promise<void>;
  metadata: Metadata;
}

export function useMyPageLogic(serverData: ServerData): UseMyPageLogicReturn {
  const [items, setItems] = useState(serverData.items);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  // Client-side state management and event handlers
  const handleItemClick = (item: Item) => {
    setSelectedItem(item);
  };

  const refreshItems = async () => {
    const newItems = await fetchItems();
    setItems(newItems);
  };

  return {
    items,
    selectedItem,
    handleItemClick,
    refreshItems,
    metadata: serverData.metadata,
  };
}
```

#### 2. Fetch Data on Server and Pass to Provider

```typescript
// page.tsx
import { PageProvider } from "@/contexts/PageStore";
import { useMyPageLogic } from "./_hooks/useMyPageLogic";
import { MyPageContent } from "./_components/MyPageContent";
import { fetchServerData } from "@/helpers/data-operations";

export default async function MyPage() {
  // Fetch data on the server
  const serverData = await fetchServerData();

  return (
    <PageProvider data={serverData} usePageHook={useMyPageLogic}>
      <MyPageContent />
    </PageProvider>
  );
}
```

#### 3. Access State in Components (Same as Pattern 1)

```typescript
// _components/MyPageContent.tsx
'use client';

import { usePage } from "@/contexts/PageStore";
import { UseMyPageLogicReturn } from "../_hooks/useMyPageLogic";

export function MyPageContent() {
  const { items, selectedItem, handleItemClick } = usePage<UseMyPageLogicReturn>();

  return (
    <div>
      {items.map(item => (
        <div key={item.id} onClick={() => handleItemClick(item)}>
          {item.name}
        </div>
      ))}
    </div>
  );
}
```

## Pattern Comparison

| Feature | Pattern 1 (Client-Only) | Pattern 2 (With Server Data) |
|---------|------------------------|------------------------------|
| **Data Fetching** | Client-side only | Server-side initial fetch |
| **Hook Signature** | `() => T` | `(data: TData) => T` |
| **Page Component** | Can be client or server | Must be server component |
| **Initial Load** | Slower (client fetch) | Faster (server fetch) |
| **SEO** | Limited | Better (pre-rendered) |
| **Use Case** | Dynamic, user-specific data | Static or initial data with client interactivity |

## When to Use Each Pattern

### Use Pattern 1 (Client-Only) when:
- Data is user-specific and requires authentication
- Data changes frequently and needs real-time updates
- SEO is not a concern
- You need to fetch data based on client-side state

### Use Pattern 2 (With Server Data) when:
- Initial data can be fetched on the server
- SEO is important
- You want faster initial page loads
- Data is relatively static or doesn't require real-time updates
- You want to combine server-side fetching with client-side interactivity

## Benefits

1. **No Prop Drilling**: Child components can access page state directly without passing props through multiple levels
2. **Type Safety**: Full TypeScript support ensures type-safe access to your page state
3. **Separation of Concerns**: Business logic stays in hooks, components focus on presentation
4. **Reusability**: Logic can be easily tested and reused
5. **Clean Code**: Pages become simple wrappers, making the codebase more maintainable
6. **Server-Side Rendering**: Leverage Next.js server components for initial data fetching
7. **Hybrid Approach**: Combine server-side data fetching with client-side interactivity

## Example Implementations

### Client-Only Pattern
- Hook: `app/voice-agent/web-dialer/_hooks/useWebDialerPage.ts`
- Page: `app/voice-agent/web-dialer/page.tsx`
- Content: `app/voice-agent/web-dialer/_components/WebDialerContent.tsx`

### Server Data Pattern
- Hook: `app/manage-tenants/[tenantId]/_hooks/useTenantUsersPage.ts`
- Page: `app/manage-tenants/[tenantId]/page.tsx`
- Content: `app/manage-tenants/[tenantId]/_components/TenantUsersContent.tsx`

## Best Practices

1. **Export Return Types**: Always export the return type of your custom hook for type safety
2. **Keep Hooks Focused**: Each hook should manage a single page's logic
3. **Document Your Hooks**: Add JSDoc comments to describe what the hook does
4. **Test Your Logic**: Hooks can be tested independently from components
5. **Use Meaningful Names**: Name your hooks and return types clearly (e.g., `useWebDialerPage`, `UseWebDialerPageReturn`)
6. **Mark Hooks as Client**: Always add `'use client'` directive to hooks that use React state/effects
7. **Type Server Data**: Create explicit types for server data passed to hooks
8. **Handle Loading States**: Consider initial loading states when using server data
