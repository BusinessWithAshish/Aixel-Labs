# Lead Generation System

A flexible lead generation system with AWS EC2 integration and manual connection options.

## Features

- **Flexible Connection Modes**: AWS EC2 management or direct BE URL connection
- **Real-time Progress**: Live updates for both EC2 startup and API operations
- **Google Maps Scraping**: Extract business leads from Google Maps
- **Streaming Results**: Real-time streaming of scraping progress and results

## Connection Modes

### Local Development Mode (Toggle ON)
- Connects to localhost backend automatically
- No configuration required
- Uses `http://localhost:8100` by default

### Remote Mode (Toggle OFF)
When local development is disabled, choose between:

#### AWS Mode (Toggle ON)
- Automatic EC2 instance management
- Validates AWS environment variables
- Starts instance → Executes commands → Makes API calls
- Shows comprehensive progress for both EC2 and API operations

#### Manual Mode (Toggle OFF)
- Direct connection to running backend
- Enter BE URL directly (e.g., `http://your-server:8100`)
- Immediate API calls (assumes backend is running)
- Localhost URLs are not allowed when local development is disabled

## Setup

### Local Development Mode
- No setup required
- Automatically connects to `http://localhost:8100`

### AWS Mode
Set these environment variables:
```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_EC2_INSTANCE_ID=i-1234567890abcdef0
AWS_EC2_AMI_ID=ami-12345678
AWS_EC2_INSTANCE_TYPE=t3.micro
AWS_EC2_KEY_NAME=your-key-pair
AWS_EC2_SECURITY_GROUP_IDS=sg-12345678
AWS_EC2_SUBNET_ID=subnet-12345678
```

### Manual Mode
1. Start your backend server
2. Get the server URL
3. Enter full URL in BE URL field: `http://your-server:8100`
4. Localhost URLs are not allowed when local development is disabled

## Usage

1. **Configure Connection**: 
   - Toggle "Use Local Development" for localhost
   - Or choose AWS mode or manual BE URL for remote connection
2. **Fill Form**: Select country, state, cities, and search query
3. **Start Scraping**: Click "Start Scraping" button
4. **Monitor Progress**: Watch real-time progress updates
5. **View Results**: See extracted leads and business information

## Architecture

### Core Components
- `GenerateLeads`: Main component with connection config and form
- `ConnectionConfig`: AWS toggle and BE URL input
- `UnifiedStreamingProgress`: Progress display for both modes
- `LocationForm`: Country/state/city selection
- `IdUrlForm`: Direct URL/ID input option
- `ResultsSection`: Display extracted leads

### Hooks
- `useUnifiedLeadStreaming`: Handles both AWS and manual streaming
- `useConnectionConfig`: Manages connection configuration
- `useLeadGenerationForm`: Form state management

### Utilities
- `streaming-utils.ts`: Shared streaming logic and validation
- `get-be-url.ts`: Smart URL management for different modes

## File Structure

```
app/lead-generation/
├── README.md                    # This file
├── page.tsx                     # Main page
└── LGS/
    ├── _components/             # UI components
    ├── _hooks/                  # React hooks
    ├── _utils/                  # Shared utilities
    └── utlis/types.ts          # Type definitions
```

## Error Handling

- **Configuration Validation**: Real-time validation with clear error messages
- **Connection Errors**: Network and server error handling
- **Streaming Errors**: Data processing error recovery
- **AWS Errors**: EC2 instance and command execution errors

## Development

The system is designed for easy maintenance and extension:
- Clean separation of concerns
- Reusable components and hooks
- Type-safe implementation
- Comprehensive error handling
