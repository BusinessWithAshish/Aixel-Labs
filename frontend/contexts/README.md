# PageStore Pattern

A Higher-Order Component (HoC) pattern for managing page-level state and business logic using React Context API.

## Overview

The PageStore pattern allows you to:
- **Centralize business logic**: Keep all page logic in a single custom hook
- **Eliminate prop drilling**: Use React Context API to access state anywhere in the component tree
- **Maintain type safety**: Full TypeScript support with generics
- **Improve code organization**: Separate concerns between logic and presentation

## Components

### `PageProvider`
A generic provider component that wraps your page content and executes a custom hook.

### `usePage<T>()`
A hook to access the page context from any child component.

## Usage

### 1. Create a Custom Hook

Create a hook that contains all your page logic:

```typescript
// _hooks/useMyPageLogic.ts
export interface UseMyPageLogicReturn {
  data: string[];
  isLoading: boolean;
  handleAction: () => void;
}

export function useMyPageLogic(): UseMyPageLogicReturn {
  const [data, setData] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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

### 2. Wrap Your Page

Use `PageProvider` in your page component:

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

### 3. Access State in Components

Use the `usePage` hook in any child component:

```typescript
// _components/MyPageContent.tsx
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

## Benefits

1. **No Prop Drilling**: Child components can access page state directly without passing props through multiple levels
2. **Type Safety**: Full TypeScript support ensures type-safe access to your page state
3. **Separation of Concerns**: Business logic stays in hooks, components focus on presentation
4. **Reusability**: Logic can be easily tested and reused
5. **Clean Code**: Pages become simple wrappers, making the codebase more maintainable

## Example Implementation

See the Web Dialer page for a complete example:
- Hook: `app/voice-agent/web-dialer/_hooks/useWebDialerPage.ts`
- Page: `app/voice-agent/web-dialer/page.tsx`
- Content: `app/voice-agent/web-dialer/_components/WebDialerContent.tsx`

## Best Practices

1. **Export Return Types**: Always export the return type of your custom hook for type safety
2. **Keep Hooks Focused**: Each hook should manage a single page's logic
3. **Document Your Hooks**: Add JSDoc comments to describe what the hook does
4. **Test Your Logic**: Hooks can be tested independently from components
5. **Use Meaningful Names**: Name your hooks and return types clearly (e.g., `useWebDialerPage`, `UseWebDialerPageReturn`)
