# Packages

## Structure

- **@aixellabs/common** - Shared types, utilities, and APIs used across frontend and backend
- **@aixellabs/mongodb** - MongoDB client and database utilities
- **@aixellabs/external** - External service integrations (Twilio, AI SDKs, etc.)

## Usage

### @aixellabs/common
```typescript
import { GMAPS_SCRAPE_REQUEST, StreamMessage } from '@aixellabs/common/apis';
import { API_ENDPOINTS } from '@aixellabs/common/utils';
import { User, ApiResponse } from '@aixellabs/common/types';
```

### @aixellabs/mongodb
```typescript
import { getCollection, getDatabase, checkConnection, MongoObjectId } from '@aixellabs/mongodb';
```

### @aixellabs/external
Reserved for future external service integrations.
