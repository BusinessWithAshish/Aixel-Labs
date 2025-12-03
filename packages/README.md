# Packages

## Structure

Single `@aixellabs/shared` package with three organized spaces:

- **common/** - Shared types, utilities, and APIs used across frontend and backend
- **mongodb/** - MongoDB client and database utilities (server-side only)
- **external/** - External service integrations (Twilio, AI SDKs, etc.)

## Usage

### Common (Frontend & Backend)
```typescript
import { GMAPS_SCRAPE_REQUEST, StreamMessage } from '@aixellabs/shared/common/apis';
import { API_ENDPOINTS } from '@aixellabs/shared/common/utils';
import { User, ApiResponse } from '@aixellabs/shared/common/types';
```

### MongoDB (Server-side only)
```typescript
import { getCollection, getDatabase, checkConnection, MongoObjectId } from '@aixellabs/shared/mongodb';
```

### External (Future)
Reserved for external service integrations.
